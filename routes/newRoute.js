const express = require('express');
const router  = express.Router();
const Job = require('../models/Job');
const Redis     = require('ioredis');
const client    = new Redis({ host: "159.223.89.164" });
const redlock   = require('ioredis-lock').createLock(client);

/****************
    const priority_jobs = [1, 2, 3];
    const default_jobs  = [20, 21, 22, 23, 24];

    let job.1 = 14;
    let job.2 = 29;
    let job.3 = 1000;
    let job.21 = 102;
    let job.23 = 394;

    let jobOb.1  = {id: 1, viewer: 14, quantity: 100};
    let jobOb.2  = {id: 2, viewer: 29, quantity: 600};
    let jobOb.3  = {id: 3, viewer: 350, quantity: 350};
    let jobOb.21  = {id: 21, viewer: 102, quantity: 999};
    let jobOb.23  = {id: 23, viewer: 394, quantity: 898};

    * Quá trình lấy job (ưu tiên lấy job từ job ưu tiên trước, sau đó mới lấy job bình thường)
    *** 1. POP jobs ids, lấy ra ID job đầu tiên.
    *** 2. Dùng ID job vừa nhận được, count jobX.[id] lên và lấy viewer về, lấy object job về.
    *** 3. Dùng viewer vừa nhận được, so sánh với quantity trong object job
    *** --- Nếu không phù hợp điều kiện thì xoá job object, xoá viewer.
    *** --- Nếu phù hợp điều kiện thì cập nhật job object, đồng thời PUSH id job trở lại vào object jobs và trả về job cho user.
****************/

const REDIS_KEY_JOB = {
    slow: 'JOB_SLOW',
    speed: 'JOB_SPEED',
    object: 'JOB_OBJECT',
    viewer: 'JOB_COUNT',
    run: 'JOB_RUN',
    hidden: 'JOB_HIDDEN',
    worker: 'JOB_WORKER'
}

const CacheJob = function(redisClient){
    var self = this;
    self.jobObject = null;
    self.jobViewer = null;
    self.saveToRedis = async function(_job){
        try {
            let job_key = REDIS_KEY_JOB[_job.is_speed ? 'speed' : 'slow'];
            await Promise.all([
                redisClient.rpush(job_key, _job._id),
                redisClient.set([REDIS_KEY_JOB.object, _job._id].join(':'), JSON.stringify(_job)),
                redisClient.set([REDIS_KEY_JOB.viewer, _job._id].join(':'), JSON.stringify(_job.viewer)),
                redisClient.set([REDIS_KEY_JOB.run, _job._id].join(':'), JSON.stringify(_job.count_is_run)),
                redisClient.set([REDIS_KEY_JOB.hidden, _job._id].join(':'), JSON.stringify(_job.hidden)),
                redisClient.set([REDIS_KEY_JOB.worker, _job._id].join(':'), JSON.stringify(_job.worker))
            ]);
            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    };
    self.checkJobQualify = function(){
        if (!self.jobObject) return false;
        let viewer   = self.jobViewer;
        let quantity = self.jobObject.quantity;
        return (quantity >= viewer);
    };
    self.returnJobObject = function(){
        let job = JSON.parse(JSON.stringify(self.jobObject));
        return Object.assign(job, {viewer: self.jobViewer});
    };
    self.prepare_get_job = function(){
        self.jobViewer = null;
        self.jobObject = null;
    };
    self.post_get_job = function(){
        let returnJob = self.returnJobObject();
        let job_key = REDIS_KEY_JOB[returnJob.is_speed ? 'speed' : 'slow'];
        redisClient.rpush(job_key, returnJob._id);
        redisClient.set([REDIS_KEY_JOB.object, returnJob._id].join(':'), JSON.stringify(returnJob));
        return returnJob;
    };
    self.get_job_id = async function(){
        let job_id = await redisClient.lpop(REDIS_KEY_JOB.speed);
        if (!job_id)
            job_id = await redisClient.lpop(REDIS_KEY_JOB.slow);
        return job_id;
    };
    self.userGetJob = async function(_id){
        self.prepare_get_job();
        let job_id = await self.get_job_id();
        if (!job_id) return null;
        let jobs = await Promise.all([
            redisClient.get([REDIS_KEY_JOB.object, job_id].join(':')),
            redisClient.incr([REDIS_KEY_JOB.viewer, job_id].join(':'))
        ]);
        self.jobObject = jobs[0];
        self.jobViewer = jobs[1];
        self.jobObject = JSON.parse(self.jobObject ? self.jobObject : '{}');
        /************ Kiểm tra job có đủ điều kiện trả về không ************/
        if (self.checkJobQualify())
            return self.post_get_job();
        return null;
    };
};

router.get('/create-job', async (req, res, next) => {
    const cacheJob = new CacheJob(client);
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
    const cacheJob = new CacheJob(client);
    let job = await cacheJob.userGetJob();
    if (job && (job.accepted <= job.quantity))
        res.status(200).send(job);
    else
        res.status(400).send('Job not found!');
});

module.exports = router;
