const Redis = require('ioredis');
const client = new Redis({ host: "103.130.213.77" });
const lock = require('ioredis-lock').createLock(client);
 
const LockAcquisitionError = lock.LockAcquisitionError;
const LockReleaseError = lock.LockReleaseError;
 
lock.acquire('app:feature:lock').then(() => {
    // Lock has been acquired
    let x = new Date();
    console.log('Lock has been acquired', x.getTime());
    return lock.release();
}).then(() => {
    // Lock has been released
    let x = new Date();
    console.log('Lock has been released', x.getTime());
}).catch(LockAcquisitionError, (err) => {
    // The lock could not be acquired
    console.log('The lock could not be acquired', err);
}).catch(LockReleaseError, (err) => {
    // The lock could not be released
    console.log('The lock could not be released', err);
});