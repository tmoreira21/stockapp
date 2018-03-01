'use strict';

function clickHandler () {
    
     this.search = function (req, res) {
        //res.render('index',{term:pesq,bars:response,logIn:ssn.logIn});
        res.render('index',{});
    }
    
    /*this.going = function (req, res) {
        var ssn = req.session;
        var user = ssn.passport.user;
        var plc = req.query.q;
        res.send(JSON.stringify("-1"));
    }*/

}

module.exports = clickHandler;