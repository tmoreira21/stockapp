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
var stk = ["FB","GOOGL","AMZN","AIV"]; //stocks being shown
//var strtDate = '2015-01-01'; //Stocks start date
var strtDate = '2017-02-20'; //Stocks start date
var currentEndDate = '2018-02-21'; //Stocks start date

//Create server
var server = http.createServer(app);
var wss = new websocket.Server({ server });

// Load Model
var Stocks = require('./app/models/stocks.js');

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
    URI += '&end_date=' + currentEndDate;
    /*if(edate.length > 0){
        URI += '&end_date=' + edate;
    }*/
    URI += '&exclude_column_names=true&column_index=1&order=asc';

    return URI;
}

function orderDataByDate(a, b){
    var keyA = new Date(a.date_day), keyB = new Date(b.date_day);
    // Compare the 2 dates
    if(keyA < keyB) return -1;
    if(keyA > keyB) return 1;
    return 0;
};

// Return all stocks marked as shown
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
            //RET
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
 * Updates stocks present in the database base on data
 * @returns nothing
 */
//UPDATE WITH CURRENT STOCKS
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
        //var startDate = currentEndDate;
        //**Go through all stocks in DB
        Stocks.find({}, function(err, stockCol) {
            if (err) {
                console.log(err);
            }
            //**For rach stock in DB update data
            stockCol.forEach(function(stock) {
                //console.log(stock.stock_code + " --- " + stock.stock_data[stock.stock_data.length-1].date_day + " ----- " + new Date().toISOString().substr(0,10));
                //hyperquest(return_URI(stock.stock_code,startDate,newEndDate).replace("&order=asc","&order=desc")).pipe(bl(function (err, data) {
                //**Get data from QUANDL between the start date and newEndDate and if no new data is retrieved do not update currentEndDate so no gap could be found on data
                hyperquest(return_URI(stock.stock_code,startDate,newEndDate)).pipe(bl(function (err, data) {
                    if(err){ return "ERR: " + console.err; }
                    var obj = JSON.parse(data.toString());
                    //**For each stock add the data of the corresponding days
                    for(var j = 0; j<obj.dataset.data.length;j++){
                        //ORDER BY DATE ACTIVATE THIS
                        //stock.stock_data.push({ 'date_day': obj.dataset.data[j][0], 'stock_value': obj.dataset.data[j][1]});
                        console.log(obj.dataset.dataset_code + ' ---- ' + obj.dataset.data[j][0] + ' --- ' + obj.dataset.data[j][1]);
                        Stocks.update( { 'stock_code': obj.dataset.dataset_code },{ $push: { 'stock_data': { 'date_day': obj.dataset.data[j][0], 'stock_value': obj.dataset.data[j][1]} } }, function(err, dc) {
                            if (err) { console.log(err); }
                        });
                        //**If new stocks detected, update currentEndDate to newEndDate
                        if(cont === 0){
                            currentEndDate = newEndDate;
                            cont++;
                        }
                    }
                    //**ORDER BY DATE ACTIVATE THIS
                    /*Stocks.update( { 'stock_code': obj.dataset.dataset_code },{ $set: { 'stock_data':  stock.stock_data.sort(orderDataByDate) } }, function(err, dc) {
                            if (err) { console.log(err); }
                    });*/
                    console.log(currentEndDate);
                }));
            });
        });
    }else{
       console.log("NO NEED TO UPDATE STOCKS");    
    }
}

wss.on('connection', function connection(ws, req) {

  //connection is up, event for request
  ws.on('message', function incoming(message) {
    //log the received message
    console.log('received: %s', message);
    var inputMessage = JSON.parse(message);
    var obj={};
    if(inputMessage.tp === 0){
        obj = loadAll(ws);
    }else if(inputMessage.tp === 1){
        //Verify if stock is in database
        Stocks.findOne({ 'stock_code': String(inputMessage.term.trim().toUpperCase()) }, function (err, stock) {
            if (err) {
                console.log(err);
            }
            // if entry does not exist insert in DB
            if (!stock) {
                console.log("DOES NOT EXIST IN DB - " + inputMessage.term);
                //hyperquest(return_URI(inputMessage.term,inputMessage.endDate)).pipe(bl(function (err, data) {
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
                        ws.send(JSON.stringify(ret));
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
                ws.send(JSON.stringify(ret));
            }
        });
    }else if(inputMessage.tp === 98){
        console.log("CHECK STOCKS");
        console.log(inputMessage.term);
        if (stk.length <= 0){
            //**Items to remove
            console.log("NO ITEMS ON LIST REMOVE ONLY");
            var ret = "";
            for(var i = 0; i < inputMessage.term.length; i++){
                ret = ret + '"' + inputMessage.term[i] + '",';
            }
            ret = ret.substr(0,ret.length-1);
            
            console.log('[{"stock_remove":[' + ret + ']}]');
            console.log(" ");
            ws.send(JSON.stringify('[{"stock_remove":[' + ret + ']}]'));
        }else{
            var rets=[];
            var rems="";
            //**Items to add
            for(var i = 0; i < stk.length; i++){
                var index = inputMessage.term.indexOf(stk[i]);
                if (index === -1) {
                    rets.push(stk[i]);
                }
            }
            //**Items to remove
            for(var i = 0; i < inputMessage.term.length; i++){
                var index = stk.indexOf(inputMessage.term[i]);
                if (index === -1) {
                    rems = rems + '"' + inputMessage.term[i] + '",';
                }
            }
            //----------------
            if(rets.length>0){
                var ret = "";
                Stocks.find( { 'stock_code': { $in: rets } } , function (err, stockDocs) {
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
                        //Add Removed items
                        if(rems.length > 0){
                            ret = ret + '{"stock_remove":[' + rems.substr(0,rems.length-1) + ']},';
                        }
                        //RET
                        if(ret.length >1){
                            ret = ret.substr(0,ret.length-1);
                        }
                        ret = ret + ']';
                        console.log("ITEMS ON LIST - ADD AND REMOVE ITENS");
                        console.log('{"stock_remove":[' + rems.substr(0,rems.length-1) + ']},');
                        console.log(" ");
                        ws.send(JSON.stringify(ret));
                    }else{
                        console.log("ITEMS ON LIST - REMOVE ONLY ITENS 1");
                        if(rems.length > 0){
                            console.log('[{"stock_remove":[' + rems.substr(0,rems.length-1) + ']}]');
                            console.log(" ");
                            ws.send(JSON.stringify('[{"stock_remove":[' + rems.substr(0,rems.length-1) + ']}]'));
                        }else{
                            console.log('[ ]');
                            console.log(" ");
                            ws.send(JSON.stringify('[]'));
                        }
                    }
                });
            }else{
                console.log("ITEMS ON LIST - REMOVE ONLY ITENS 2");
                if(rems.length > 0){
                    console.log('[{"stock_remove":[' + rems.substr(0,rems.length-1) + ']}]');
                    console.log(" ");
                    ws.send(JSON.stringify('[{"stock_remove":[' + rems.substr(0,rems.length-1) + ']}]'));
                }else{
                    console.log('[ ]');
                    console.log(" ");
                    ws.send(JSON.stringify('[]'));
                }
            }
        }
        console.log(" ");
    }else if(inputMessage.tp === 99){
        console.log("STOCK REMOVED");
        console.log(" ");
        var index = stk.indexOf(inputMessage.term.trim().toUpperCase());     
        if (index > -1) {
            stk.splice(index, 1);
            ws.send(JSON.stringify('[]'));
        }
        
    }
  
  });
});

//Runs from Tuesday to Saturday at 00:01 and updates database
//schedule.scheduleJob('0 1 * * 2-6', function(){
schedule.scheduleJob('17 11 * * *', function(){
    updateStocks();
});

//start our server
server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
  console.log(new Date().toISOString());
})