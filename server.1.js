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

//Create server
var server = http.createServer(app);
var wss = new websocket.Server({ server });

var stk = [];
var Stocks = require('./app/models/stocks.js');

//function return_URI(arg1,sdate,edate){
function return_URI(arg1){
    var URI = 'https://www.quandl.com/api/v3/datasets/WIKI/';
    URI += arg1 + '.json';
    URI += '?api_key=' + process.env.STOCK_KEY;
    //URI += '&start_date=' + sdate;
    //URI += '&end_date=' + edate;
    URI += '&exclude_column_names=true&column_index=1&order=asc';

    return URI;
}

// Get the data for each stock and return only when all results are received
function getURLdata(ws,item,message,i,startDate,endDate){
    hyperquest(return_URI(item,startDate,endDate)).pipe(bl(function (err, data) {
        if(err){ return "ERR: " + console.err; }
        var dt = data.toString();
        //result.push(dt);
        cont++;
        if(cont === stocks.length){
            console.log(dt);
            ws.send(JSON.stringify([dt]));
		}
    }));
}

// Verify if requested item is already on database
function verifyDatabase(message){
    var ret = true;
    var cont = 0;
    Stocks.findOne({ 'stock_name': String(message) }, function (err, stock) {
        if (err) {
            console.log(err);
        }
        // if entry does not exist insert in DB
        if (!stock) {
            ret = false;   
            cont++;
        }else{
            cont++;
        }
        
    });
    if(cont === 1){
        return ret;
    }
}

// Return all stocks marked as shown
function loadAll(ws1){
    console.log("LOAD ALL");
    console.log(" ");
    var ret = "";
    console.log(stk);
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
            ws1.send(JSON.stringify([]));
        }
    });
}


wss.on('connection', function connection(ws, req) {

  //connection is up, event for request
  ws.on('message', function incoming(message) {
    //log the received message
    console.log('received: %s', message);
    console.log(" ");
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
                console.log(" ");
                //hyperquest(return_URI(inputMessage.term,inputMessage.startDate,inputMessage.endDate)).pipe(bl(function (err, data) {
                hyperquest(return_URI(inputMessage.term)).pipe(bl(function (err, data) {
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
    //}else if(tp === 2){
    }else if(inputMessage.tp === 99){
        console.log("STOCK REMOVED");
        console.log(" ");
        var index = stk.indexOf(inputMessage.term.trim().toUpperCase());     
        if (index > -1) {
            stk.splice(index, 1);
        }
        //ws.send(JSON.stringify([]));
    }
    //get quote and dated from url
    //----------------------------
    //----------------------------
    //----------------------------
    //----------------------------
    //verifiy if quote is on database, if not
    
    
    /*console.log(verifyDatabase(message));
    if(verifyDatabase(message)===false){
        //call stock api to check if stock quote exists
        var inputMessage = JSON.parse(message);
        hyperquest(return_URI(inputMessage.term,inputMessage.startDate,inputMessage.endDate)).pipe(bl(function (err, data) {
            if(err){ return "ERR: " + console.err; }
            var chkresult = data.toString();
            //if dos not exist returns error
            //console.log(chkresult);
            if(chkresult.indexOf("QECx02")>0){
                var obj = { errtype:1 ,desc:"<strong>Inexistent quote!</strong> Please try another." };
                console.log(obj);
                ws.send(JSON.stringify(obj));
            //if exists return everything
            }else{
                //add message to database
                stocks.push(inputMessage.term);
                //reset results and counter
                result = [];
                cont = 0;
                //get everything
                for(var i = 0; i < stocks.length; i++){
    	            getURLdata(ws,stocks[i],inputMessage.term,i,inputMessage.startDate,inputMessage.endDate);
                }
            }
        }));
    //if exists on database
    }else{
        var obj = { errtype:2 ,desc:"<strong>Quote already being presented!</strong> Please try another." };
        //console.log(obj);
        ws.send(JSON.stringify(obj));
    }*/
  });
  //send immediatly a feedback to the incoming connection   
  //ws.send(JSON.stringify('Connected to the WebSocket Server'));
});

//Runs everyday at 00:01 and updates database
/*schedule.scheduleJob('1 0 * * *', function(){
  console.log('The answer to life, the universe, and everything!');
});*/

//start our server
server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
});