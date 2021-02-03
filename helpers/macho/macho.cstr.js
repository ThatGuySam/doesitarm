var Cstr = function Cstr(buf) {
    this.toString = function() {
        return JSON.stringify(this);
    };
    var cstr = '';
    for(var i = 0; i < buf.length; i++) {
        cstr += String.fromCharCode(buf[i]);
    }
    return cstr;
};

export default Cstr
