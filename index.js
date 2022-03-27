var client = require("ioredis").createClient({host: '103.130.213.77'});
var lock = require("redis-lock")(client);

let key = "myLock5";

const { forEach } = require('p-iteration');
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

(async function printFiles () {
    console.log('xx');
    for (const time of [...Array(10).keys()]) {
        await sleep(100);
        if (time==5) break;
        console.log(time+1)
    };
    console.log('yyy')
})();



// console.log("Asking for lock");
// (async function(){
//     let e = await client.get(key);
//     console.log('e', e);
//     lock(key, async function(done) {
//         console.log("Lock acquired");
//         var s = await client.setnx(key, 'xxxx');
//         console.log(s);
//         let r = await client.get(key);
//         console.log(r)
//         setTimeout(function() {
//             // Simulate some task
//             console.log("Releasing lock now");
//             // done(function() {
//             //     console.log("Lock has been released, and is available for others to use");
//             // });
//         }, 5000);
//     });
// })()

