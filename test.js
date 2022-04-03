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


// Có 300.000 user account. từ 1->300.000
// Có 2000 jobs hoặc 1000 jobs. từ 1->2000, số lượng (quantity) ngẫu nhiên từ 50-10.000

// Lúc trả job về cho user, thêm 1 redis cộng số lượng trả về theo job id.

// Job_0001_quantity;
// Job_0001_quantity_count;
// Job_0001_quantity_user=[account1,account2,account3...];