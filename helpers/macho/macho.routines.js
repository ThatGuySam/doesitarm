var RoutinesCommand = function RoutinesCommand(cmd, cmdsize, init_address, init_module, reserved1, reserved2, reserved3, reserved4, reserved5, reserved6) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.init_address = init_address || 0x00000000;
    this.init_module = init_module || 0x00000000;
    this.reserved1 = reserved1 || 0x00000000;
    this.reserved2 = reserved2 || 0x00000000;
    this.reserved3 = reserved3 || 0x00000000;
    this.reserved4 = reserved4 || 0x00000000;
    this.reserved5 = reserved5 || 0x00000000;
    this.reserved6 = reserved6 || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};
var RoutinesCommand64 = function RoutinesCommand64(cmd, cmdsize, init_address, init_module, reserved1, reserved2, reserved3, reserved4, reserved5, reserved6) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.init_address = init_address || 0x0000000000000000;
    this.init_module = init_module || 0x0000000000000000;
    this.reserved1 = reserved1 || 0x0000000000000000;
    this.reserved2 = reserved2 || 0x0000000000000000;
    this.reserved3 = reserved3 || 0x0000000000000000;
    this.reserved4 = reserved4 || 0x0000000000000000;
    this.reserved5 = reserved5 || 0x0000000000000000;
    this.reserved6 = reserved6 || 0x0000000000000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};