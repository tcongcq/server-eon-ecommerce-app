var redis = require('redis');
var Redlock = require('redlock');

var client;
var redlock;

module.exports.redisConnection = function(port,host){
    client = redis.createClient(port,host);
    redlock = new Redlock(
        [client],
        {
            driftFactor : 0.01,
            retryCount : 15,
            retryDelay : 200
        }
    );

    client.on('connect',function(){
        console.info("Redis default connection open to "+host+":"+port);
    });

    client.on('error',function(err){
        console.info("Redis default connection error "+err);
        console.info("Redis Path : "+host+":"+port);
    });

    redlock.on('clientError', function(err) {
        console.info("A Redis Error Has Occurred : "+err);
    });

    process.on('SIGINT', function() {
        client.quit();
        console.info("Redis default connection disconnected");
        process.exit(0);
    });
};

module.exports.lockRessource = function(ressource_id,callback){
    redlock.lock(ressource_id,2000,function(err,lock){
        if(err){
            callback(err,null);
        }
        else{
            callback(null,lock);
        }
    });
};

module.exports.unlockLock = function(lock,callback){
    lock.unlock(function(err){
        if(err){
            callback(true,null);
        }
        else{
            callback(null,true);
        }
    });
};