const express = require('express');
const router  = express.Router();
const Job = require('../models/Job');
const Redis     = require('ioredis');
const client    = new Redis({ host: "188.166.236.27" });
const redlock   = require('ioredis-lock').createLock(client);
const uuid 	= require("uuid");

/**** Thời gian một key value trên redis sẽ hết hạn. Tránh việc sử dụng càng ngày càng phình to DB lên. ****/
const expireInSeconds = 24*60*60;

/**** Hằng số quy định phân loại các key sẽ được ghi vào redis ****/
const REDIS_KEY_JOB = {
	expire: 'JOB_EX',
    slow: 'JOB_SLOW',
    speed: 'JOB_SPEED',
    object: 'JOB_OBJECT',
    count_is_run: 'JOB_CIR',
    viewer: 'JOB_VIEWER',
    worker: 'JOB_WORKER',
    hidden: 'JOB_HIDDEN'
}

/**** Object chứa tất cả các tính năng tương tác cho dịch vụ ****/
const JobDivision = function(redisClient){
	var self = this;
	/**** Khai báo các biến để lưu trữ Job ****/
    self.jobObject		= null;
	self.jobQuantity	= null;
	self.jobCountIsRun	= null;
	self.jobViewer		= null;
	self.jobWorker		= null;
	self.jobHidden		= null;

	/**** Hàm ghi một Job vào Redis ****/
	self.saveToRedis = async function(_job){
        try {
            let job_key = REDIS_KEY_JOB[_job.is_speed ? 'speed' : 'slow'];
            await Promise.all([
                redisClient.rpush(job_key, _job._id),
                redisClient.set([REDIS_KEY_JOB.object, _job._id].join(':'), JSON.stringify(_job), 'EX', expireInSeconds),
                redisClient.set([REDIS_KEY_JOB.count_is_run, _job._id].join(':'), JSON.stringify(_job.count_is_run), 'EX', expireInSeconds),
                redisClient.set([REDIS_KEY_JOB.viewer, _job._id].join(':'), JSON.stringify(_job.viewer), 'EX', expireInSeconds),
                redisClient.set([REDIS_KEY_JOB.worker, _job._id].join(':'), JSON.stringify(_job.worker), 'EX', expireInSeconds),
                redisClient.set([REDIS_KEY_JOB.hidden, _job._id].join(':'), JSON.stringify(_job.hidden, 'EX', expireInSeconds))
            ]);
            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    };

    /**** 
     * Hàm lấy JobID mỗi khi có User vào nhận Job 
     * Ở đây buộc phải có account_id, nhằm lưu lại và xác thực một account 
     *  không được làm một Job nhiều hơn một lần.
    ****/
    self.get_job_id = async function(account_id){
    	// Kiểm tra nếu job đã được làm rồi bởi account thì chặn không cho account đó làm tiếp
    	// Mỗi jobID và accountID sẽ được lưu lại trên redis 24h dùng để chặn.
    	// Nếu set được lock point thì trả về job vừa set. Còn nếu không thì trả job vào trong hàng đợi theo từng type
    	let job_type = REDIS_KEY_JOB.speed;
        let job_id = await redisClient.lpop(job_type);
        if (!job_id){
        	job_type = REDIS_KEY_JOB.slow;
            job_id = await redisClient.lpop(job_type);
        }
        if (!job_id) return null;
    	let hasSetJobLock = await redisClient.set([REDIS_KEY_JOB.object, account_id, job_id].join(':'), 1, 'NX', 'EX', expireInSeconds);
    	if (hasSetJobLock)
    		return job_id;
		redisClient.rpush(job_type, job_id);
    	return null;
    };

    /**** Hàm kiểm tra Job có đủ điều kiện trả về hay không ****/
    self.checkJobQualify = function(){
    	if (!self.jobObject) return false;
        let quantity = self.jobObject.quantity;
        let viewer   = self.jobViewer;
        let hidden   = self.jobHidden;
        let countIsRun	= self.jobCountIsRun;
        if (countIsRun >= quantity)
        	return self.removeAndReturnSuccess();
        if (hidden >= quantity)
        	return self.removeAndReturnFailed();
        return (quantity >= viewer);
    };
    /**** Hàm xoá Job khỏi Redis ****/
    self.removeJob = async function(){
    	let obj = self.jobObject;
    	return await Promise.all([
            redisClient.del([REDIS_KEY_JOB.object, obj._id].join(':')),
            redisClient.del([REDIS_KEY_JOB.count_is_run, obj._id].join(':')),
            redisClient.del([REDIS_KEY_JOB.viewer, obj._id].join(':')),
            redisClient.del([REDIS_KEY_JOB.worker, obj._id].join(':')),
            redisClient.del([REDIS_KEY_JOB.hidden, obj._id].join(':'))
        ]);
    };
    /**** Hàm xoá Job và gọi sang API thông báo Job đã Thành công ****/
    self.removeAndReturnSuccess = function(){
    	self.removeJob();
    	// call api to success job with job object
    	console.log('Removed Job out of Redis and call api to Success job with job object');
    	return false;
    };
    /**** Hàm xoá Job và gọi sang API thông báo Job đã Thất bại ****/
    self.removeAndReturnFailed = function(){
    	// call api to failed job with job object
    	console.log('Removed Job out of Redis and call api to Failed job with job object');
    	return false;
    };
    /**** Hàm trả về object Job khi kết hợp các thông tin cơ bản ****/
    self.returnJobObject = function(){
        let job = JSON.parse(JSON.stringify(self.jobObject));
        return Object.assign(job, {
        	count_is_run: self.jobCountIsRun,
        	viewer: self.jobViewer,
        	worker: self.jobWorker,
        	hidden: self.jobHidden
        });
    };
    /**** Hàm chuẩn bị các biến trước khi làm việc với Redis nhận dữ liệu trả về cho người dùng ****/
    self.prepare_get_job = function(){
        self.jobObject		= null;
		self.jobQuantity	= null;
		self.jobCountIsRun	= null;
		self.jobViewer		= null;
		self.jobWorker		= null;
		self.jobHidden		= null;
    };
    /**** Hàm chính xử lý việc lấy Job ra từ Redis và trả lại cho người dùng ****/
    self.userGetJob = async function(account_id){
        self.prepare_get_job();
        let job_id = await self.get_job_id(account_id);
        if (!job_id) return null;
        let jobs = await Promise.all([
            redisClient.get([REDIS_KEY_JOB.object, job_id].join(':')),
            redisClient.get([REDIS_KEY_JOB.count_is_run, job_id].join(':')),
            redisClient.incr([REDIS_KEY_JOB.viewer, job_id].join(':')),
            redisClient.incr([REDIS_KEY_JOB.worker, job_id].join(':')),
            redisClient.get([REDIS_KEY_JOB.hidden, job_id].join(':'))
        ]);
        self.jobObject      = jobs[0];
        self.jobCountIsRun 	= jobs[1];
        self.jobViewer 		= jobs[2];
        self.jobWorker 		= jobs[3];
        self.jobHidden 		= jobs[4];
        self.jobObject = JSON.parse(self.jobObject ? self.jobObject : '{}');
        self.jobQuantity 	= self.jobObject.quantity;
        /************ Kiểm tra job có đủ điều kiện trả về không ************/
        if (self.checkJobQualify())
            return self.post_get_job();
        return null;
    };
    /**** Hàm xử lý việc làm sau khi đã nhận được biến Job và trước khi trả Job lại cho người dùng ****/
    self.post_get_job = function(){
        let returnJob = self.returnJobObject();
        let job_key = REDIS_KEY_JOB[returnJob.is_speed ? 'speed' : 'slow'];
        redisClient.rpush(job_key, returnJob._id);
        redisClient.set([REDIS_KEY_JOB.object, returnJob._id].join(':'), JSON.stringify(returnJob));
        return returnJob;
    };
    /**** Hàm tăng giá trị CountIsRun ****/
    self.increaseJobCount = async function(job_id){
    	return await redisClient.incr([REDIS_KEY_JOB.count_is_run, job_id].join(':'));
    };
    /**** Hàm tăng giá trị Hidden ****/
    self.increaseJobHidden = async function(job_id){
    	return await redisClient.incr([REDIS_KEY_JOB.hidden, job_id].join(':'));
    };
}

router.get('/create-job', async (req, res, next) => {
    const cacheJob = new JobDivision(client);
    let is_speed = (Math.random()>=0.95)? 1 : 0;
    let jobData = new Job({ is_speed: is_speed });
    jobData.save().then(async (job) => {
        await cacheJob.saveToRedis(job);
        res.send(job);
    }, (e) => {
        console.log(e);
        res.status(400).send(e);
    });
});

router.get('/user-get-job', async (req, res) => {
    const cacheJob = new JobDivision(client);
    let job = await cacheJob.userGetJob(uuid.v4()); // uuid.v4() <=> account_id
    if (job && (job.accepted <= job.quantity))
        res.status(200).send(job);
    else
        res.status(400).send('Job not found!');
});

router.get('/inc-job-count', async (req, res) => {
	const request = req.query;
    const cacheJob = new JobDivision(client);
    let job = await cacheJob.increaseJobCount(request.job_id);
    res.status(200).send({count: job});
    
});
router.get('/inc-job-hidden', async (req, res) => {
	const request = req.query;
    const cacheJob = new JobDivision(client);
    let job = await cacheJob.increaseJobHidden(request.job_id);
    res.status(200).send({hidden: job});
});

module.exports = router;