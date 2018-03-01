'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var Stock = new Schema({
    _id: { type: Schema.ObjectId, auto: true },
	stock_code: String,
	stock_name: String,
    stock_data: [{
      date_day: String,
      stock_value: String
   }],
});

module.exports = mongoose.model('Stock', Stock);