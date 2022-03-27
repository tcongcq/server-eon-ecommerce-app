const express = require('express');
const router  = express.Router();
const Redis     = require('ioredis');
const client    = new Redis({ host: "103.130.213.77" });
const redlock   = require('ioredis-lock').createLock(client);

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

let resource = 'resource:xxxx';

router.get('/', async function(req, res, next){
    console.log('Sleep 1000ms');
    await sleep(1000);
    await client.set("mykey", "abc");
    await sleep(1000);
    let mykey = await client.get("mykey");
    console.log(mykey);
    // redlock.acquire(resource).then(async () => {
    //     // do something
    //     return redlock.release();
    // })
    res.send('hello world');
});
module.exports = router;