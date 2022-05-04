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
router.get('/products', async function(req, res, next){
    let products = [{"id":"p1","ownerId":"u1","title":"Red Shirt","imageUrl":"https://cdn.pixabay.com/photo/2016/10/02/22/17/red-t-shirt-1710578_1280.jpg","description":"A red t-shirt, perfect for days with non-red weather.","price":29.99},{"id":"p2","ownerId":"u1","title":"Blue Carpet","imageUrl":"https://images.pexels.com/photos/6292/blue-pattern-texture-macro.jpg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260","description":"Fits your red shirt perfectly. To stand on. Not to wear it.","price":99.99},{"id":"p3","ownerId":"u2","title":"Coffee Mug","imageUrl":"https://images.pexels.com/photos/160834/coffee-cup-and-saucer-black-coffee-loose-coffee-beans-160834.jpeg?cs=srgb&dl=bean-beans-black-coffee-160834.jpg&fm=jpg","description":"Can also be used for tea!","price":8.99},{"id":"p4","ownerId":"u3","title":"The Book - Limited Edition","imageUrl":"https://images.pexels.com/photos/46274/pexels-photo-46274.jpeg?cs=srgb&dl=blur-blurred-book-pages-46274.jpg&fm=jpg","description":"What the content is? Why would that matter? It's a limited edition!","price":15.99},{"id":"p5","ownerId":"u3","title":"PowerBook","imageUrl":"https://get.pxhere.com/photo/laptop-computer-macbook-mac-screen-water-board-keyboard-technology-air-mouse-photo-airport-aircraft-tablet-aviation-office-black-monitor-keys-graphic-hardware-image-pc-exhibition-multimedia-calculator-vector-water-cooling-floppy-disk-phased-out-desktop-computer-netbook-personal-computer-computer-monitor-electronic-device-computer-hardware-display-device-448748.jpg","description":"Awesome hardware, crappy keyboard and a hefty price. Buy now before a new one is released!","price":2299.99},{"id":"p6","ownerId":"u1","title":"Pen & Paper","imageUrl":"https://cdn.pixabay.com/photo/2015/10/03/02/14/pen-969298_1280.jpg","description":"Can be used for role-playing (not the kind of role-playing you're thinking about...).","price":5.49}];
    await sleep(500);
    return res.status(200).send({msg: '', ok: 1, data: products});
});
module.exports = router;
