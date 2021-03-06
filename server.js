var express = require('express'),
    http = require('http'),
    hyperquest = require('hyperquest'),
    bl = require('bl'),
    bodyParser = require('body-parser'),
    hbs = require('express-handlebars'),
    path = require('path'),
    websocket = require('ws'),
    schedule = require('node-schedule'),
    mongoose = require('mongoose');

var app = express();
var routes = require('./app/routes/index.js');
//ENVIRONMENT
require('dotenv').load();
mongoose.connect(process.env.MONGO_URI);
app.engine('hbs',hbs({extname:'hbs',defaultLayout:'layout',layoutsDir: __dirname + '/app/views/layouts/'}));
app.set('views',path.join(__dirname, 'app/views'));
app.set('view engine', 'hbs');
app.use('/public', express.static(process.cwd() + '/public'));
app.use('/controllers', express.static(process.cwd() + '/app/controllers'));
app.use(bodyParser.urlencoded({ extended: false }));
routes(app);
//END ENVIRONMENT

//GLOBAL VARIABLES
//var stk = ["FB","GOOGL","AMZN","AIV"]; //stocks being shown
var stk = []; //stocks being shown
var CLIENTS = [];
var id = -1;
var strtDate = '2015-01-01'; //Stocks start date
//var strtDate = '2017-02-20'; //Stocks start date
var currentEndDate = '2018-02-21'; //Stocks start date

//Create server
var server = http.createServer(app);
var wss = new websocket.Server({ server });

// Load Model
var Stocks = require('./app/models/stocks.js');

/**
 * *************************************
 * RETURNS QUANDL API URI
 * *************************************
 * Return the quandl api url with the received parameters
 * @returns String
 */
//Return URI to get stock data through API
function return_URI(arg1,sdate,edate){
    var URI = 'https://www.quandl.com/api/v3/datasets/WIKI/';
    URI += arg1 + '.json';
    URI += '?api_key=' + process.env.STOCK_KEY;
    if(sdate.length > 0){
        URI += '&start_date=' + sdate;
    }else{
        URI += '&start_date=' + strtDate;
    }
    if(edate.length > 0){
        URI += '&end_date=' + edate;
    }else{
        URI += '&end_date=' + currentEndDate;   
    }
    URI += '&exclude_column_names=true&column_index=1&order=asc';

    return URI;
}

/**
 * *************************************
 * ORDER ARRAY OF OBJECTS BY DATE
 * *************************************
 */
function orderDataByDate(a, b){
    var keyA = new Date(a.date_day), keyB = new Date(b.date_day);
    // Compare the 2 dates
    if(keyA < keyB) return -1;
    if(keyA > keyB) return 1;
    return 0;
};

/**
 * *************************************
 * SENDS ACTIVE STOCKS TO CLIENT ON FIRST ACCESS
 * *************************************
 * Sends all stocks being presented to clients to a client that has just connectd to the websocket server
 * @returns nothing
 */
function loadAll(ws1){
    console.log("LOAD ALL");
    console.log(stk);
    console.log(" ");
    var ret = "";
    Stocks.find( { 'stock_code': { $in: stk } } , function (err, stockDocs) {
        if (err) {
            console.log(err);
        }
        if (stockDocs) {
            var ret = '[';
            for (var i = 0; i < stockDocs.length; i++) {
                ret = ret + '{"dataset_code":"' + stockDocs[i].stock_code + '","name":"' + stockDocs[i].stock_name + '","data":[';
                for (var j = 0; j < stockDocs[i].stock_data.length; j++) {
                    if (j > 0){
                        ret = ret + ',';
                    }
                    ret = ret + '["' + stockDocs[i].stock_data[j].date_day + '",' + stockDocs[i].stock_data[j].stock_value + ']';
                }
                ret = ret + ']},';
            }
            if(ret.length >1){
                ret = ret.substr(0,ret.length-1);
            }
            ret = ret + ']';
            ws1.send(JSON.stringify(ret));
        }else{
            ws1.send(JSON.stringify('[]'));
        }
    });
}

/**
 * *************************************
 * UPDATES STOCKS ON DATABASE
 * *************************************
 * Updates stocks present in the database with more recent data
 * Called by node-schedule
 * @returns nothing
 */
function updateStocks(){
    //**Get today's date
    var newEndDate = new Date().toISOString().substr(0,10);
    //**If current end date different from today's date update stocks
    if(currentEndDate !== newEndDate){
        console.log("UPDATE STOCKS");
        var nDate = new Date(currentEndDate);
        //**Set start date to collect data equal next day of the current end date
        var startDate = new Date(nDate.getFullYear(),nDate.getMonth(),nDate.getDate()+1).toISOString().substr(0,10);
        var cont = 0;
        //**Go through all stocks in DB
        Stocks.find({}, function(err, stockCol) {
            if (err) {
                console.log(err);
            }
            //**For rach stock in DB update data
            stockCol.forEach(function(stock) {
                //**Get data from QUANDL between the start date and newEndDate and if no new data is retrieved do not update currentEndDate so no gap could be found on data
                hyperquest(return_URI(stock.stock_code,startDate,newEndDate)).pipe(bl(function (err, data) {
                    if(err){ return "ERR: " + console.err; }
                    var obj = JSON.parse(data.toString());
                    //**For each stock add the data of the corresponding days
                    for(var j = 0; j<obj.dataset.data.length;j++){
                        Stocks.update( { 'stock_code': obj.dataset.dataset_code },{ $push: { 'stock_data': { 'date_day': obj.dataset.data[j][0], 'stock_value': obj.dataset.data[j][1]} } }, function(err, dc) {
                            if (err) { console.log(err); }
                        });
                        //**If new stocks detected, update currentEndDate to newEndDate
                        if(cont === 0){
                            currentEndDate = newEndDate;
                            cont++;
                        }
                    }
                    console.log(currentEndDate);
                }));
            });
        });
    }else{
       console.log("NO NEED TO UPDATE STOCKS");    
    }
}


/**
 * **************************************
 * WEBSOCKET SERVER
 * *************************************
 * Handles the websocket server connections
 * Handles the websocket server received messages from clients returning data to clients when needed
 * @returns nothing
 */
wss.on('connection', function connection(ws, req) {

    id = id + 1;
    ws.id = id;
    CLIENTS.push(ws);
    console.log("connected with id: " + ws.id);
    //CLIENTS.push(ws);

  //connection is up, event for request
  ws.on('message', function incoming(message) {
    //log the received message
    console.log('received: %s', message);
    var inputMessage = JSON.parse(message);
    var obj={};
    //LOAD AT FIRST ACCESS TO PAGE
    if(inputMessage.tp === 0){
        obj = loadAll(ws);
    //ADD STOCK
    }else if(inputMessage.tp === 1){
        //Verify if stock is in database
        Stocks.findOne({ 'stock_code': String(inputMessage.term.trim().toUpperCase()) }, function (err, stock) {
            if (err) {
                console.log(err);
            }
            // if entry does not exist insert in DB
            if (!stock) {
                console.log("DOES NOT EXIST IN DB - " + inputMessage.term);
                hyperquest(return_URI(inputMessage.term,'','')).pipe(bl(function (err, data) {
                    if(err){ return "ERR: " + console.err; }
                    var chkresult = data.toString();
                    //if dos not exist returns error
                    if(chkresult.indexOf("QECx02")>0){
                        console.log("STOCK NOT FOUND - " + inputMessage.term);
                        console.log(" ");
                        var obj = { errtype:1 ,desc:"<strong>Inexistent quote!</strong> Please try another." };
                        ws.send(JSON.stringify(obj));
                    //if exists return object
                    }else{
                        console.log("INSERTED IN DATABASE AND RETURNED - " + inputMessage.term);
                        console.log(" ");
                        //add message to visible data
                        var obj = JSON.parse(data.toString());
                        stk.push(obj.dataset.dataset_code);
                        var dataIns = [];
                        var ret = '[{"dataset_code":"' + obj.dataset.dataset_code + '","name":"' + obj.dataset.name + '","data":[';
                        
                        for(var j = 0; j<obj.dataset.data.length;j++){
                            dataIns.push({date_day: obj.dataset.data[j][0] , stock_value: obj.dataset.data[j][1]});
                             if (j > 0){
                                ret = ret + ',';
                            }
                            ret = ret + '["' + obj.dataset.data[j][0] + '",' + obj.dataset.data[j][1] + ']';
                        }
                        //Insert in database
                        var newStock = new Stocks();
                        newStock.stock_code = obj.dataset.dataset_code;
                        newStock.stock_name = obj.dataset.name;
                        newStock.stock_data = dataIns;
                        newStock.save(function (err) {
                            if (err) {
                                throw err;
                            }
                        });
                        
                        //RET
                        ret = ret + ']}]';
                        for(var kb = 0; kb < CLIENTS.length; kb++){
                            CLIENTS[kb].send(JSON.stringify(ret));
                        }
                    }
                }));    
            }else{
                console.log("RETURN EXISTENT STOCK - " + stock.stock_code);
                console.log(" ");
                var ret = '[{"dataset_code":"' + stock.stock_code + '","name":"' + stock.stock_name + '","data":[';
                for (var i = 0; i < stock.stock_data.length; i++) {
                    if (i > 0){
                        ret = ret + ',';
                    }
                    ret = ret + '["' + stock.stock_data[i].date_day + '",' + stock.stock_data[i].stock_value + ']';
                }
                //RET
                stk.push(stock.stock_code);
                ret = ret + ']}]';
                for(var kb = 0; kb < CLIENTS.length; kb++){
                    CLIENTS[kb].send(JSON.stringify(ret));
                }
            }
        });
    //**REMOVE STOCKS
    }else if(inputMessage.tp === 99){
        console.log("STOCK REMOVED");
        console.log(" ");
        var index = stk.indexOf(inputMessage.term.trim().toUpperCase());     
        if (index > -1) {
            stk.splice(index, 1);
            console.log('[{"stock_remove":[' + inputMessage.term.trim().toUpperCase() + ']}]');
            for(var kb = 0; kb < CLIENTS.length; kb++){
                CLIENTS[kb].send(JSON.stringify('[{"stock_remove":["' + inputMessage.term.trim().toUpperCase() + '"]}]'));
            }
        }
    }
  
  });
  
  ws.on('close', function() {
        console.log('USER ' + ws.id + ' LEFT');
        var rem = -1;
        for(var i = 0; i<CLIENTS.length; i++){
            if(CLIENTS[i].id === ws.id){
                rem = i;
                break;
            }
        }
        CLIENTS.splice(rem, 1);
  });
    
});

/**
 * **************************************
 * UPDATES STOCKS ON DATABASE
 * *************************************
 * Updates stocks present in the database with data from last update date to present day
 * Runs from Tuesday to Saturday at 01:00 and updates database
 * @returns nothing
 */
//schedule.scheduleJob('0 1 * * 2-6', function(){
schedule.scheduleJob('9 15 * * *', function(){
    updateStocks();
});

/**
 * *************************************
 * STARTS SERVER
 * *************************************
 * Starts sever listener on port 8080
 * Logs on console the listening server IP and port and datetime
 * @returns nothing
 */
server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
  console.log(new Date().toISOString());
})