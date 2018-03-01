$(document).ready(function() {
    redrawStockMng();
});
setTimeout(function(){sendDataToServer('',0);}, 1000);
window.onfocus = function (){
	sendDataToServer('',98);
}
document.focus = window.focus;