  var stocks = [];
  var stock_name = [];
  var btn = $( "#sendmsg" );
  var content = $( "#results" );
  var err = $( "#err" );
  var stock_mng = $( "#stock_mng" );
  
  //-------------------------
  //---- GRAPH VARIABLES ----
  //-------------------------
  var seriesOptions = [],
  seriesCounter = 0;

/**
 * Create the chart when all data is loaded
 * @returns {undefined}
 */
//function createChart() {

    var chart = Highcharts.stockChart('highstockgraph', {

        rangeSelector: {
            selected: 4
        },

        yAxis: {
            labels: {
                formatter: function () {
                    return (this.value > 0 ? ' + ' : '') + this.value + '%';
                }
            },
            plotLines: [{
                value: 0,
                width: 2,
                color: 'silver'
            }]
        },

        plotOptions: {
            series: {
                compare: 'percent',
                showInNavigator: true
            }
        },

        tooltip: {
            pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y}</b> ({point.change}%)<br/>',
            valueDecimals: 2,
            split: true
        },

        series: seriesOptions
    });
//}
//createChart();
//--------------------------------------------------
//--WEBSOCKET---------------------------------------
//--------------------------------------------------
  
  // if user is running mozilla then use it's built-in WebSocket
  window.WebSocket = window.WebSocket || window.MozWebSocket;

  var connection = new WebSocket('wss://stockapp-tmoreira21.c9users.io');

  connection.onopen = function () {
    // connection is opened and ready to use
  };

  connection.onerror = function (error) {
    // an error occurred when sending/receiving data
  };

  connection.onmessage = function (message) {
    // try to decode json (I assume that each message
    // from server is json)
    //console.log(message.data);
    try {
      var json = $.parseJSON(message.data);
    } catch (e) {
      console.log('This doesn\'t look like a valid JSON: ', message.data);
      return;
    }
    // handle incoming message
    if(json.errtype !== undefined){
      showError(json.desc);
    }else{
      err.hide();
      $( "#term").val("");
      var item = $.parseJSON(json);
      //console.log(item);
      for(var i = 0; i<item.length; i++){
          if(item[i].stock_remove){
              console.log("------1------");
              console.log(item[i]);
              var index = -1;
              for(var j = 0; j < item[i].stock_remove.length; j++){
                    index = stocks.indexOf(item[i].stock_remove[j]);     
                    if (index > -1) {
                        stocks.splice(index, 1);
                        stock_name.splice(index, 1);
                        var seriesLength = chart.series.length;
                        for(var k = seriesLength - 1; k > -1; k--)
                        {
                            //chart.series[i].remove();
                            if(chart.series[k].name === item[i].stock_remove[j]){
                                chart.series[k].remove();
                                break;
                            }
                        }
                    }
              }
              if(item[i].stock_remove.length > 0){
                  redrawStockMng();
              }
          }else{
              console.log("-------2-------");
              console.log(item[i]);
              //console.log(item);
              //var item = $.parseJSON(json[0]);
              //console.log("data: " + item.dataset.data + "   length: " + item.dataset.data.length + "   0: " + item.dataset.data[0][0] + "   1: " + item.dataset.data[0][1] + "\n");
              addToGraph(item[i].dataset_code,item[i].data);
              //add to stocks array and redraw
              stocks.push(item[i].dataset_code);
              stock_name.push(item[i].name);
          }  
          //console.log(stocks);
      }
      redrawStockMng();
    }
  };
 //--------------------------------------------------
 //REDRAW THE EXISTING STOCK MNG
 function redrawStockMng(){
     var cnt = 0; 
     stock_mng.html('');
     for(var i = 0; i<stocks.length; i++){
         if(cnt === 0){ stock_mng.append( '<div class="row">');}
         stock_mng.append( '<div class="col-xs-3 col-md-3" style="margin:10px; padding:15px; background-color:#E9E9E9;"><strong>' + stocks[i] + '</strong><br />' + stock_name[i] +' <hr style="border-top: 1px solid #000;" /><button type="button" class="btn btn-danger" onClick="removeFromStockGraph(\'' + stocks[i] + '\');">Remove stock</button></div>' );
         if(cnt === 2){ stock_mng.append( '</div>' ); cnt = -1;}
         cnt++;
     }
     if(cnt !== 0){ stock_mng.append( '</div>' );}
 }
 
 function removeFromStockGraph(stockrm){
    var index = stocks.indexOf(stockrm);     
    if (index > -1) {
        stocks.splice(index, 1);
        stock_name.splice(index, 1);
        var seriesLength = chart.series.length;
        for(var i = seriesLength - 1; i > -1; i--)
        {
            //chart.series[i].remove();
            if(chart.series[i].name === stockrm){
                chart.series[i].remove();
                break;
            }
        }
        sendDataToServer(stockrm,99);
    }
    redrawStockMng();
 }
 
 //-------------------------------------------------------------------
 
 //ADD STOCK TO GRAPH
 function addToGraph(name,data){
  seriesOptions = [];
  var data2 = [];
  var dt = 0;
  for(var i = 0; i < data.length; i++){
      data2.push([new Date(data[i][0].replace("-","/")).getTime(),data[i][1]]);
  }
  
  seriesOptions[0] = {
    name: name,
    data: data2
  };
 
  chart.addSeries(seriesOptions[0]);
  
  chart.redraw();
 }

//-------------------------------------------------------------------

function showError(msg){
  //$( "#term").val("");https://stockapp-tmoreira21.c9users.io/#
  err.hide();
  $( "#err1" ).html(msg);
  err.show();
}

//-------------------------------------------------------------------

function sendDataToServer(trm,type){
    var input={}
    if(type===0){
        var input = {"term": "", "tp": 0};
        connection.send(JSON.stringify(input));
    }else if(type===1){
        err.hide();
        if($.trim($('#term').val()).length > 0){
            if(stocks.indexOf($.trim($('#term').val()).toUpperCase())>=0){
                showError("Stock already being presented.");
            }else{
                //GET DATA
                //var input = {"term": $('#term').val(),"startDate": "2017-11-01","endDate": "2018-02-18","tp": 1};
                var input = {"term": $('#term').val(),"tp": 1};
                connection.send(JSON.stringify(input));
            }
        }
    }else if(type===2){
        err.hide();
        //FALTA FUNÇÃO PARA VERIFICAR DATAS
        //GET DATA
        //var input = {"term": "","startDate": "2017-11-01","endDate": "2018-02-18","tp": 2};
        var input = {"term": "","tp": 2};
        connection.send(JSON.stringify(input));
    }else if(type===98){
        err.hide();
        var input = {"term": stocks, "tp": 98};
        connection.send(JSON.stringify(input));
    }else if(type===99){
        err.hide();
        //FALTA FUNÇÃO PARA VERIFICAR DATAS
        //GET DATA
        var input = {"term": trm,"tp": 99};
        connection.send(JSON.stringify(input));
    }
}
  
btn.unbind('click').on("click",function() {
    sendDataToServer('',1)
});
 
$("[data-hide]").on("click", function(){
    $(this).closest("." + $(this).attr("data-hide")).hide();
});
 
$("#srch").submit(function(e){ 
   e.preventDefault();
});

//--------------------------------------------------
//---- PREPARA OS DADOS DOS STOCKS PARA MOSTRAR ----
//--------------------------------------------------
/*$.each(names, function (i, name) {

    $.getJSON('https://www.highcharts.com/samples/data/jsonp.php?filename=' + name.toLowerCase() + '-c.json&callback=?',    function (data) {

        seriesOptions[i] = {
            name: name,
            data: data
        };

        // As we're loading the data asynchronously, we don't know what order it will arrive. So
        // we keep a counter and create the chart when all the data is loaded.
        seriesCounter += 1;

        if (seriesCounter === names.length) {
            createChart();
        }
    });
});*/