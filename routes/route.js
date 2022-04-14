const express = require('express');
const router  = express.Router();
const Job = require('../models/Job');
const Redis     = require('ioredis');
const client    = new Redis({ host: "103.130.213.77" });
// const redlock   = require('ioredis-lock').createLock(client, {timeout: 20000, retries: 3, delay: 100});
const Redlock = require('redlock');
const redlock = new Redlock(
    [client], { retryCount: 1, retryDelay: 20 }
);

/**** Hằng số quy định phân loại các key sẽ được ghi vào redis ****/
const REDIS_KEY_JOB = {
    list: 'JOB_IDS',
    done: 'JOB_DONE',
    lock: 'JOB_LOCK',
    object: 'JOB',
    account: 'JOB_MEMBER'
}
const TEST_KEY = {
    quantity: 'TQ',
    qtt_count: 'TQC',
    qusr_list: 'TSL'
}
const LockTimeout = 10000;
const JobComplete = 'JOB_COMPLETE';
const JobTrash    = 'JOB_TRASH';

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**** Object chứa tất cả các tính năng tương tác cho dịch vụ ****/
const JobDivision = function(redisClient){
	var self = this;
    self.jobId      = null;
    self.jobObject  = null;
    self.jobPass    = [];
    self.jobAccount = [];
    self.lockId     = null;
    self.lockJob    = null;
    self.accountId  = null;
    self.tryTimes   = 0;

	self.saveToRedis = async function(_job){
        try {
            let jobId = [_job.is_speed?'F':'L',_job._id].join("");
            let tasks = [
                redisClient.sadd(REDIS_KEY_JOB.list, jobId),
                redisClient.hmset([REDIS_KEY_JOB.object, _job._id].join(':'), _job)
            ];
            if (_job.account_ids && _job.account_ids.length > 0){
                _job.account_ids.forEach(function(account){
                    if (account)
                        tasks.push(redisClient.sadd([REDIS_KEY_JOB.done, account].join(":"), jobId));
                });
            }
            await Promise.all(tasks);
            return true;
        } catch (err) {
            return false;
        }
    };
    self.getValidJobID = async function(availJobIds){
        if (self.tryTimes > 10) return null;
        let listJob = availJobIds.filter((i)=>{return self.jobPass.indexOf(i) < 0}).sort();
        if (listJob && listJob.length > 0 && listJob[0].substring(0, 1) != 'F')
            listJob = listJob.sort(()=>{return 0.5 - Math.random()});
        let jobId = listJob.shift();
        if (!jobId) return null;
        let lockKey = [REDIS_KEY_JOB.lock, jobId.substring(1)].join(':');
        try {
            self.lockJob = await redlock.acquire([lockKey], LockTimeout);
            return jobId;
        } catch (err) {
            self.jobPass.push(jobId);
            self.tryTimes++;
            return self.getValidJobID(availJobIds);
        }
    };
    self.getJobID = async function (){
        let availJobIds = await redisClient.sdiff(REDIS_KEY_JOB.list, [REDIS_KEY_JOB.done, self.accountId].join(':'))
        let validJobId  = await self.getValidJobID(availJobIds);
        if (!validJobId) return null;
        self.lockId = validJobId;
        return validJobId.substring(1);
    };
    /**** Hàm xoá Job và gọi sang API thông báo Job đã Thành công ****/
    self.removeAndReturnSuccess = async function(){
        await self.removeJob();
        console.log(self.jobObject);
        console.log(self.jobAccount);
        // call api to success job with job object
        console.log('Removed Job out of Redis and call api to Success job with job object');
        return false;
    };
    /**** Hàm xoá Job và gọi sang API thông báo Job đã Thất bại ****/
    self.removeAndReturnFailed = async function(){
        await self.removeJob();
        console.log(self.jobObject);
        console.log(self.jobAccount);
        // call api to failed job with job object
        console.log('Removed Job out of Redis and call api to Failed job with job object');
        return false;
    };
    self.removeJob = async function(){
        let jobKey = [REDIS_KEY_JOB.object, self.jobId].join(':');
        let jobAccount  = await redisClient.smembers([REDIS_KEY_JOB.account, self.jobId].join(':'));
        let tasks = [
            redisClient.smove(REDIS_KEY_JOB.list, JobComplete, self.lockId),
            redisClient.del([REDIS_KEY_JOB.account, self.jobId].join(':')),
            redisClient.del([REDIS_KEY_JOB.object, self.jobId].join(':'))
        ];
        self.jobAccount = jobAccount;
        if (jobAccount && jobAccount.length > 0){
            jobAccount.forEach(function(account){
                if (account)
                    tasks.push(redisClient.smove([REDIS_KEY_JOB.done, account].join(":"), JobTrash, self.lockId));
            });
        }
        Promise.all(tasks);
        return null;
    };
    self.prepare_get_job = function(){
        self.jobId      = null;
        self.jobObject  = null;
        self.accountId  = null;
        self.lockId     = null;
        self.lockJob    = null;
        self.jobPass    = [];
        self.jobAccount = [];
        self.tryTimes   = 0;
    };
    self.userGetJob = async function(account_id){
        self.prepare_get_job();
        self.accountId = account_id;
        let jobId = await self.getJobID();
        if (!jobId) return null;
        let jobKey = [REDIS_KEY_JOB.object, jobId].join(':');
        self.jobId     = jobId;
        let jobObject = await redisClient.hgetall(jobKey);
        self.jobObject = Object.assign(jobObject, {viewer: parseInt(jobObject.viewer)+1, worker: parseInt(jobObject.worker)+1});
        Promise.all([
            redisClient.hincrby(jobKey, 'viewer', 1),
            redisClient.hincrby(jobKey, 'worker', 1),
            redisClient.sadd([REDIS_KEY_JOB.done, self.accountId].join(':'), self.lockId),
            redisClient.sadd([REDIS_KEY_JOB.account, jobId].join(':'), self.accountId),
            redisClient.setnx([TEST_KEY.quantity, jobId].join('_'), jobObject.quantity),
            redisClient.incr([TEST_KEY.qtt_count, jobId, 'count'].join('_')),
            redisClient.rpush([TEST_KEY.qusr_list, jobId, 'quantity_user'].join('_'), account_id)
        ]);
        return self.post_get_job();
    };
    self.post_get_job = async function(){
        let job = self.jobObject;
        try {
            self.lockJob.unlock();
        } catch (err) {}
        let count_is_run = parseInt(job.count_is_run);
        let quantity = parseInt(job.quantity);
        let hidden = parseInt(job.hidden);
        let viewer = parseInt(job.viewer);
        if (count_is_run >= quantity)
            return self.removeAndReturnSuccess();
        if (hidden >= quantity)
            return self.removeAndReturnFailed();
        if (viewer <= quantity)
            return job;
        return self.removeJob();
    };
    self.cleanDoneJob = async function(){
        let redisGet = await Promise.all([
            redisClient.smembers(JobComplete),
            redisClient.keys([REDIS_KEY_JOB.done, '*'].join(":"))
        ]);
        let completeJob = redisGet[0];
        let accountDone = redisGet[1];
        console.log(redisGet)
        if (completeJob.length == 0)
            return 'Empty key';
        let tasks = [];
        completeJob.forEach((jobId)=>{
            accountDone.forEach(async (accDoneKey)=>{
                tasks.push(redisClient.smove(accDoneKey, JobTrash, jobId));
            });
            tasks.push(redisClient.smove(JobComplete, JobTrash, jobId));
        });
        tasks.push(redisClient.del(JobTrash));
        await Promise.all(tasks);
        return 'Cleaned';
    };
    /**** Hàm tăng giá trị CountIsRun ****/
    self.increaseJobCount = async function(jobId){
        let lockKey = [REDIS_KEY_JOB.lock, jobId].join(':');
        let jobKey  = [REDIS_KEY_JOB.object, jobId].join(':');
        try {
            let lock = await redlock.acquire([lockKey], LockTimeout);
            let res = await redisClient.hincrby(jobKey, 'count_is_run', 1);
            lock.unlock();
            return res;
        } catch (err) {
            return null;
        }
    };
    /**** Hàm tăng giá trị Hidden ****/
    self.increaseJobHidden = async function(jobId){
        let lockKey = [REDIS_KEY_JOB.lock, jobId].join(':');
        let jobKey  = [REDIS_KEY_JOB.object, jobId].join(':');
        try {
            let lock = await redlock.acquire([lockKey], LockTimeout);
            let res = await redisClient.hincrby(jobKey, 'hidden', 1);
            lock.unlock();
            return res;
        } catch (err) {
            return null;
        }
    };
}

router.get('/test', async (req, res, next) => {
    // let x = await client.hincrby("JOB_OBJECT:623dc639b431bf23496914c9", "is_speed", 1);
    // let x = await client.lrange("JOB_SLOW", 0, 1);
    // let x = await client.lpush("JOB_DONE:eoneon", "623dc7446520c9bac6efedce");
    // await client.sadd("JOB_DONE:eoneon", "L623dcb6c8da4d61b13786752");
    // console.log(x);
    
    // Acquire a lock.
    
    try {
        console.log("prepare to get")
        let lock = await redlock.acquire(["b"], 5100);
        console.log('sleep 5s')
        await sleep(1000);
        console.log('sleep 4s')
        await sleep(1000);
        console.log('sleep 3s')
        await sleep(1000);
        console.log('sleep 2s')
        await sleep(1000);
        console.log('sleep 1s')
        await sleep(1000);
        await lock.unlock();
    } catch (err) {
        console.log(err)
        console.log('xb')
    }
    res.status(200).send('abc');
});

router.get('/create-job', async (req, res, next) => {
    const cacheJob = new JobDivision(client);
    let is_speed = (Math.random()>=0.95)? 1 : 0;
    let jobData = new Job({ is_speed: is_speed });
    jobData.save().then(async (job) => {
        let jobParse = JSON.parse(JSON.stringify(job));
        // jobParse.accountIds = [
        //   'c8a74024-8963-42c3-8e65-c83efa9dc2b0',
        //   '45eaa278-eed4-470b-9ae7-d645848f3051',
        //   '5c3704d5-ea59-465d-a6a9-7342d2c32db6',
        //   '4d211399-9127-4429-ae76-d36543ce6e3c',
        //   '235737fc-9b52-4637-accc-2d15ef78b368',
        //   '4e2703b3-0da7-4af0-ab21-05dbd52e8991',
        //   'bd56e755-da37-4a52-80fb-bcd8e9199d25',
        //   'ffc0f8a3-349e-4ab8-bd82-3fc1868507f8',
        //   '64ffb46b-f7d6-404a-97c8-4d7757159bd4'
        // ];
        await cacheJob.saveToRedis(jobParse);
        res.send(job);
    }, (e) => {
        console.log(e);
        res.status(400).send(e);
    });
});

router.get('/user-get-job', async (req, res) => {
    let request = req.query;
    const cacheJob = new JobDivision(client);
    const uuid     = require("uuid");
    let account_id = request.account_id ? request.account_id : uuid.v4();
    let job = await cacheJob.userGetJob(account_id); // uuid.v4() <=> account_id
    // let job = await cacheJob.userGetJob('eoneonb'); // uuid.v4() <=> account_id
    if (job)
        res.status(200).send(job);
    else
        res.status(400).send('Job not found!');
});

router.get('/clean-done-job', async (req, res) => {
    const cacheJob = new JobDivision(client);
    let clean = await cacheJob.cleanDoneJob();
    res.status(200).send({count: clean});
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

router.get('/test-create-job', async (req, res) => {
    for (var i = 1; i <= 2000; i++) {
        let cacheJob = new JobDivision(client);
        let is_speed = (Math.random()>=0.95)? 1 : 0;
        let jobData = new Job({ is_speed: is_speed, temp_id: i });
        jobData.save().then(async (job) => {
            let jobParse = JSON.parse(JSON.stringify(job));
            await cacheJob.saveToRedis(jobParse);
            console.log(jobParse.temp_id);
        });
    };
    res.status(200).send('create-job');
});


const randNum = (min, max) => Math.floor(Math.random() * (max - min)) + min;
const callUserGetJob = async function(account_id){
    let cacheJob = new JobDivision(client);
    let start = new Date().getTime();
    let job = await cacheJob.userGetJob(account_id);
    let stop = new Date().getTime();
    console.log(stop-start);
};
const callRandomTimeGetJob = function(){
    let n = randNum(50, 1000);
    // let n = randNum(1, 3);
    for (const time of [...Array(n).keys()]) {
        let account_id = randNum(1, 300000);
        // let account_id = randNum(1, 3);
        // console.log('account_id', account_id)
        callUserGetJob(account_id);
    };
};
const cron = require('cron');
router.get('/test-user-get-job', async (req, res) => {
    const job = new cron.CronJob({
        cronTime: '*/1 * * * * *', // Chạy Jobs mỗi 10 giây
        onTick: async function() {
            callRandomTimeGetJob()
            // console.log('Cron job runing...');
            console.log('==========================================');
        },
        start: true, 
        timeZone: 'Asia/Ho_Chi_Minh'
    });
    // job.start();
    res.status(200).send('user-get-job');
});


module.exports = router;