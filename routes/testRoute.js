const express = require('express');
const router  = express.Router();

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const loginData = {
    email: 'tcongcq@gmail.com',
    password: '12345678',
    localId: 111,
    idToken: '0j4iQozhzBsATl7Lf.AWW1hp5v_VuWC2GStOv7R96C3zA.BicPkH.tR.AAA.0.0.BicPkH.AWXQXfzaK6c',
    expiresIn: '3600'
};

router.get('/', async function(req, res, next){
    res.send('index');
});
router.post('/login', async function(req, res, next){
    let request = req.body;
    await sleep(500);
    if (request.email != loginData.email || request.password != loginData.password)
        return res.status(400).send({msg: '', ok: 0});
    return res.status(200).send({msg: '', ok: 1, localId: loginData.localId, idToken: loginData.idToken, expiresIn: loginData.expiresIn});
});
router.post('/sign-up', async function(req, res, next){
    let request = req.body;
    await sleep(500);
    if (request.email != loginData.email || request.password != loginData.password)
        return res.status(400).send({msg: '', ok: 0});
    return res.status(200).send({msg: '', ok: 1, localId: loginData.localId, idToken: loginData.idToken, expiresIn: loginData.expiresIn});
});
module.exports = router;
