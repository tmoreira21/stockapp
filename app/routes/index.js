'use strict'

var ClickHandler = require(process.cwd() + '/app/controllers/clickHandler.server.js');

module.exports = function (app) {
    
    var clickHandler = new ClickHandler(); 
    
    //OK
    app.get('/',clickHandler.search);
    app.post('/',clickHandler.search);

    //app.get('/going',isLoggedIn,clickHandler.going);

    //--------------------LOGIN LOGOUT-------------------
    
    //app.get('/logout',isLoggedIn,function (req, res) {
    //        req.logout();
    //        res.redirect('/');
    //});
        
    //function isLoggedIn (req, res, next) {
    //   var ssn = req.session;
    //    if (req.isAuthenticated()) {
    //        ssn.logIn = true;
    //        return next();
    //    }
    //    ssn.logIn = false;
    //    res.redirect('/');
    //}
};
