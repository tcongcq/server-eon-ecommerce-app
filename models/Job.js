const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var jobSchema = new Schema({
    quantity: {
        type: Number,
        default: function() {
            return Math.floor(Math.random()*10000) + 50
        }
    },
    temp_id: {
        type: Number,
        default: 0
    },
    count_is_run: {
        type: Number,
        default: 0
    },
    viewer: {
        type: Number,
        default: 0
    },
    hidden: {
        type: Number,
        default: 0
    },
    worker: {
        type: Number,
        default: 0
    },
    accepted: {
        type: Number,
        default: 0
    },
    is_speed: {
        type: Number,
        default: 0
    },
    message: {
        type: String,
        default: 'Đang chạy'
    }
})

const Job = mongoose.model('Job', jobSchema);

module.exports = Job