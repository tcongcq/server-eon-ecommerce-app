// JOB_PRIORITY_IDS="1,2,3,4,5"
// JOB_DEFAULT_IDS="681,380,378,682,683,382,381,384,383,711,713,507,506,808,645,646,644,809,810,648,647,811,650,649,653,651,815,812,814,813,654,652,817,655,818,819,816,657,656,518,511,547,545,546,542,544,543,541,540,539,538,537,535,536,534,533,532,531,530,528,529,526,527,524,525,523,522,519,521,561,558,559,557,556,554,555,552,553,551,549,550,548,605,604,758"
// JOB_681=asdasds

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var database = require('./bin/database');

var port = process.env.PORT || 3000;
// var indexRouter = require('./routes/index');
// var indexRouter = require('./routes/newRoute');
var indexRouter = require('./routes/route');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
database.connectDB();

// setup router
app.use('/', indexRouter);

app.listen(port,function(){
  console.log("Server listening connect port " + port)
})
module.exports = app;