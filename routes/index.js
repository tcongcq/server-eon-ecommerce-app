const express = require('express');
const router  = express.Router();
const Job = require('../models/Job');
const Redis = require('ioredis')
const redisClient = new Redis({ host: "103.130.213.77" });

const RedisProvider = function(_redisClient, options={}){
    var self = this;
    self.client = _redisClient;
    self.expire = options.expire ? options.expire : 30;
    self.prefix = options.prefix ? options.prefix : 'LOCK';
    self.try    = options.try ? options.try : 10; // times
    self.trytime= options.trytime ? options.trytime : 10; //miliseconds
    self.keylock = (_key)=>{
        return [self.prefix, _key].join(':');
    };
    self.setnx = async (key, value)=>{
        let setnx = await _redisClient.setnx(self.keylock(key), value);
        if (!setnx) return setnx;
        await redisClient.expire(key, self.expire);
        await _redisClient.set(key, value);
        return 1;
    };
    self.unlock = async (key)=>{
        await redisClient.del(self.keylock(key));
        return 1;
    };
    self.setlock = async (key, value)=>{
        for (const time of [...Array(self.try).keys()]) {
            let setnx = await self.setnx(key, value);
            if (setnx) return setnx;
            await sleep(self.trytime);
        };
        console.log('Tried '+self.try+' times without success!');
        return 0;
    };
};

const REDIS_KEY_JOB_SLOW  = 'JOB_SLOW';
const REDIS_KEY_JOB_SPEED = 'JOB_SPEED';
const REDIS_KEY_JOB_OBJ   = 'JOB_OBJECT';
const REDIS_KEY_JOB_CNT   = 'JOB_COUNT';


function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

let resource = 'resource:xxxx';

router.get('/', async function(req, res, next){
    res.send('hello world')
});

router.get('/get-foo', async function(req, res, next){
    let x = await redisClient.keys('JOB_COUNT:*');
    console.log(x);
    res.send(x);
});

router.get('/set-foo', async function(req, res, next){
    let x = await redisClient.set('JOB', '[]');
    res.send(x);
});
router.get('/get-job', async function(req, res, next){
    let x = await redisClient.incr(resource);
    // let x = await redisClient.decr(resource);
    let r = x <= 100 ? x : 'lock';
    console.log(r);
    res.send(JSON.stringify({'r': r}));
});
router.get('/set-foo-nx', async function(req, res, next){
    let x = await redisClient.setnx(resource, 'set foo nx');
    console.log(x);
    res.send('x');
});




router.get('/update-job', async (req, res, next) => {
    let request = req.query;
    console.log(request);
    let redisJobObj = await redisClient.get([REDIS_KEY_JOB_OBJ, request._id].join(':'));
    let redisJobQty = await redisClient.get([REDIS_KEY_JOB_CNT, request._id].join(':'));
    console.log(redisJobObj);
    console.log(redisJobQty);
    res.send('update');
});

const cache_job = async (_job) => {
    try {
        let key = _job.is_speed ? REDIS_KEY_JOB_SPEED : REDIS_KEY_JOB_SLOW;
        await redisClient.set([REDIS_KEY_JOB_OBJ, _job._id].join(':'), JSON.stringify(_job), 'EX', 86400);
        await redisClient.set([REDIS_KEY_JOB_CNT, key, _job._id].join(':'), JSON.stringify(_job.quantity), 'EX', 86400);
        return true;
    } catch (err) {
        console.log(err);
        return false;
    }
}
router.get('/create-job', async (req, res, next) => {
    let tmp_job_ids = null;
    let is_speed = (Math.random()>=0.95)? 1 : 0;
    let newJob = new Job({ is_speed: is_speed });
    newJob.save().then(async (job) => {
        cache_job(job);
        res.send(job);
    }, (e) => {
        res.status(400).send(e);
    });
});

const RedisCacheJob = function(){
    var self = this;
    let redisProvider = new RedisProvider(redisClient);
    self.get_job_ids = async ()=>{
        let jobs = await redisProvider.client.keys([REDIS_KEY_JOB_CNT, REDIS_KEY_JOB_SPEED, '*'].join(':'));
        if (!jobs || !jobs.length)
            jobs = await redisProvider.client.keys([REDIS_KEY_JOB_CNT, REDIS_KEY_JOB_SLOW, '*'].join(':'));
        if (!jobs || !jobs.length)
            jobs = [];
        let job_ids = [];
        jobs.forEach((job, idx)=>{
            let row = job.split(':');
            job_ids.push({
                is_speed: row[1] == REDIS_KEY_JOB_SPEED ? true : false,
                _id: row[2]
            });
        });
        return job_ids;
    };
    self.get_job = async (job_ids)=>{
        let item_idx = Math.floor(Math.random()*job_ids.length);
        let jobItem  = job_ids[item_idx];
        let job_id   = jobItem._id;
        let prefix   = jobItem.is_speed ? REDIS_KEY_JOB_SPEED : REDIS_KEY_JOB_SLOW;
        let jobQty   = await redisProvider.client.get([REDIS_KEY_JOB_CNT, prefix, job_id].join(':'));
        if (jobQty <= 0){
            self.remove_job(job_id);
            self.remove_job(job_id);
            self.remove_job(job_id);
            self.remove_job(job_id);
            self.remove_job(job_id);
            return;
        }
        let job = await redisProvider.client.get([REDIS_KEY_JOB_OBJ, job_id].join(':'));
        if (!job || !JSON.parse(job))
            return false;
        job = JSON.parse(job);
        let cnt = await redisProvider.client.decr([REDIS_KEY_JOB_CNT, prefix, job_id].join(':'));
        job = Object.assign(job, {accepted: (parseInt(job.quantity)-cnt)});
        let r = await redisProvider.setlock([REDIS_KEY_JOB_OBJ, job_id].join(':'), JSON.stringify(job));
        if (!(job.accepted >= job.quantity))
            await redisProvider.unlock([REDIS_KEY_JOB_OBJ, job_id].join(':'));
        return r ? job : null;
    };
    self.update_job = async (_id, newData)=>{
        let job = await redisProvider.client.get([REDIS_KEY_JOB_OBJ, _id].join(':'));
        if (!job || !JSON.parse(job))
            return false;
        job = Object.assign(job, newData);
        await redisProvider.set([REDIS_KEY_JOB_OBJ, _id].join(':'), JSON.stringify(job));
        return true;
    };
    self.remove_job = async (_id)=>{
        let job = await redisProvider.client.get([REDIS_KEY_JOB_OBJ, _id].join(':'));
        if (!job || !JSON.parse(job))
            return;
        job = JSON.parse(job);
        let key = job.is_speed ? REDIS_KEY_JOB_SPEED : REDIS_KEY_JOB_SLOW;
        await redisProvider.client.del([REDIS_KEY_JOB_OBJ, _id].join(':'));
        await redisProvider.client.del([REDIS_KEY_JOB_CNT, key, _id].join(':'));
        /********************/
        /*** Update to DB ***/
        /********************/
    };
}

router.get('/user-get-job', async (req, res) => {
    let redisCacheJob = new RedisCacheJob();
    let job_ids = await redisCacheJob.get_job_ids();


    if (!job_ids || !job_ids.length) {
        res.status(404).send('Job empty');
        return;
    }
    let job = await redisCacheJob.get_job(job_ids);
    console.log(JSON.stringify(job));
    if (job && (job.accepted <= job.quantity))
        res.status(200).send('Job detail!');
    else
        res.status(400).send('Job not found!');
});

module.exports = router;




