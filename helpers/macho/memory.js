//memory.js
//Written by Sem Voigtländer
//Licensed under the MIT License

/*
	Functionality for geting the memory size of a javascript object
*/

export function free(objectName)
{
    if(eval(objectName) != 'undefined')
    {
        console.log('Helping the garbage collector a little bit with freeing.');
        eval(objectName + '=undefined;');
    }
}

export function sizeof(object) {

    var objectList = [];
    var stack = [object];
    var bytes = 0;

    while (stack.length) {
        var value = stack.pop();

        if (typeof value === 'boolean') {
            bytes += 4;
        } else if (typeof value === 'string') {
            bytes += value.length * 2;
        } else if (typeof value === 'number') {
            bytes += 8;
        } else if (
            typeof value === 'object' &&
            objectList.indexOf(value) === -1
        ) {
            objectList.push(value);

            for (var i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
}

/*
	Functions for swapping the endianness of an integer
	Supports 16, 32 and 64 bit integers. (Experimental 128-bits as well)
	Smaller integers are automatically casted to the corresponding size.
	Bigger integers are not casted to smaller integers as they may lose precision.
*/

export function SwapEndian16(integer) {

    var _hex = '0';
    var _output = '';

    //Input validation
    if(typeof integer !== 'number')
        throw new Error('Invalid argument. argument provided is not an integer.');
    if(integer < 0)
        throw new Error('Invalid argument. argument provided may not be negative.');

    _hex = integer.toString(16); //Conver the input to a hexadecimal string

    //Conver the hexadecimal string to a 16-bit integer hexadecimal string
    while(_hex.length < 4)
        _hex = '0'+_hex;

    let _arr = _hex.split(''); //Convert the 16-bit integer hexadecimal string to a char array

    //Sanity check
    if (_arr.length != 4)
        throw new Error('Invalid argument. argument provided is not a 16-bit integer.');


    //Swap the endianness
    _output += (_arr[2] + _arr[3]).toString();
    _output += (_arr[0] + _arr[1]).toString();

    //Output sanity check
    if(_output.length != 4)
        throw new Error('Sanity check failed. Output is not a 16-bit integer');

    _output = parseInt('0x'+_output); //convert the hexadecimal output string to an integer

    //Conversion sanity check
    if(_output === NaN)
        throw new Error('Conversion from a hexadecimal string to an integer failed.');

    return _output;
}

export function SwapEndian32(integer) {

    var _hex = '0';
    var _output = '';

    //Input validation
    if(typeof integer !== 'number')
        throw new Error('Invalid argument. argument provided is not an integer.');
    if(integer < 0)
        throw new Error('Invalid argument. argument provided may not be negative.');

    _hex = integer.toString(16); //Conver the input to a hexadecimal string

    //Conver the hexadecimal string to a 32-bit integer hexadecimal string
    while(_hex.length < 8)
        _hex = '0'+_hex;

    let _arr = _hex.split(''); //Convert the 32-bit integer hexadecimal string to a char array

    //Sanity check
    if (_arr.length != 8)
        throw new Error('Invalid argument. argument provided is not a 32-bit integer.');


    //Swap the endianness
    _output += (_arr[6] + _arr[7]).toString();
    _output += (_arr[4] + _arr[5]).toString();
    _output += (_arr[2] + _arr[3]).toString();
    _output += (_arr[0] + _arr[1]).toString();

    //Output sanity check
    if(_output.length != 8)
        throw new Error('Sanity check failed. Output is not a 32-bit integer');

    _output = parseInt('0x'+_output); //convert the hexadecimal output string to an integer

    //Conversion sanity check
    if(_output === NaN)
        throw new Error('Conversion from a hexadecimal string to an integer failed.');

    //Lets help javascripts garbage collector a bit
    _arr = undefined;
    _hex = undefined;

    return _output;
}

export function SwapEndian64(integer) {

    var _hex = '0';
    var _output = '';

    //Input validation
    if(typeof integer !== 'number')
        throw new Error('Invalid argument. argument provided is not an integer.');
    if(integer < 0)
        throw new Error('Invalid argument. argument provided may not be negative.');

    _hex = integer.toString(16); //Conver the input to a hexadecimal string

    //Conver the hexadecimal string to a 64-bit integer hexadecimal string
    while(_hex.length < 16)
        _hex = '0'+_hex;

    let _arr = _hex.split(''); //Convert the 64-bit integer hexadecimal string to a char array

    //Sanity check
    if (_arr.length != 16)
        throw new Error('Invalid argument. argument provided is not a 64-bit integer.');


    //Swap the endianness
    _output += (_arr[14] + _arr[15]).toString();
    _output += (_arr[12] + _arr[13]).toString();
    _output += (_arr[10] + _arr[11]).toString();
    _output += (_arr[8] + _arr[9]).toString();
    _output += (_arr[6] + _arr[7]).toString();
    _output += (_arr[4] + _arr[5]).toString();
    _output += (_arr[2] + _arr[3]).toString();
    _output += (_arr[0] + _arr[1]).toString();

    //Output sanity check
    if(_output.length != 16)
        throw new Error('Sanity check failed. Output is not a 64-bit integer');

    _output = parseInt('0x'+_output); //convert the hexadecimal output string to an integer

    //Conversion sanity check
    if(_output === NaN)
        throw new Error('Conversion from a hexadecimal string to an integer failed.');

    //Lets help javascripts garbage collector a bit
    _arr = undefined;
    _hex = undefined;

    return _output;
}

export function SwapEndian128(integer) {

    var _hex = '0';
    var _output = '';

    //Input validation
    if(typeof integer !== 'number')
        throw new Error('Invalid argument. argument provided is not an integer.');
    if(integer < 0)
        throw new Error('Invalid argument. argument provided may not be negative.');

    _hex = integer.toString(16); //Conver the input to a hexadecimal string

    //Conver the hexadecimal string to a 128-bit integer hexadecimal string
    while(_hex.length < 32)
        _hex = '0'+_hex;

    let _arr = _hex.split(''); //Convert the 128-bit integer hexadecimal string to a char array

    //Sanity check
    if (_arr.length != 32)
        throw new Error('Invalid argument. argument provided is not a 128-bit integer.');


    //Swap the endianness
    _output += (_arr[30] + _arr[31]).toString();
    _output += (_arr[28] + _arr[29]).toString();
    _output += (_arr[26] + _arr[27]).toString();
    _output += (_arr[24] + _arr[25]).toString();
    _output += (_arr[22] + _arr[23]).toString();
    _output += (_arr[20] + _arr[21]).toString();
    _output += (_arr[18] + _arr[19]).toString();
    _output += (_arr[16] + _arr[17]).toString();
    _output += (_arr[14] + _arr[15]).toString();
    _output += (_arr[12] + _arr[13]).toString();
    _output += (_arr[10] + _arr[11]).toString();
    _output += (_arr[8] + _arr[9]).toString();
    _output += (_arr[6] + _arr[7]).toString();
    _output += (_arr[4] + _arr[5]).toString();
    _output += (_arr[2] + _arr[3]).toString();
    _output += (_arr[0] + _arr[1]).toString();

    //Output sanity check
    if(_output.length != 32)
        throw new Error('Sanity check failed. Output is not a 128-bit integer');

    _output = parseInt('0x'+_output); //convert the hexadecimal output string to an integer

    //Conversion sanity check
    if(_output === NaN)
        throw new Error('Conversion from a hexadecimal string to an integer failed.');

    //Lets help javascripts garbage collector a bit
    _arr = undefined;
    _hex = undefined;

    return _output;
}


/*
	Functions for reading integers from a given offset in a given array.
	Supports 16, 32 and 64 bit integers. (Experimental 128-bits as well)
	It also supports reading with a different Endianness.

*/

//Big Endian
export function ReadUint16(arr, off) {

    if(arr.length < 2 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off].toString(16) +
    	arr[off + 1].toString(16)
    );
}

export function ReadUint32(arr, off) {

    if(arr.length < 4 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off].toString(16) +
    	arr[off + 1].toString(16) +
    	arr[off + 2].toString(16) +
    	arr[off + 3].toString(16)
    );
}

export function ReadUint64(arr, off) {

    if(arr.length < 8 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off].toString(16) +
    	arr[off + 1].toString(16) +
    	arr[off + 2].toString(16) +
    	arr[off + 3].toString(16) +
    	arr[off + 4].toString(16) +
    	arr[off + 5].toString(16) +
    	arr[off + 6].toString(16) +
    	arr[off + 7].toString(16)
    );
}

export function ReadUint128(arr, off) {

    if(arr.length < 16 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off].toString(16) +
    	arr[off + 1].toString(16) +
    	arr[off + 2].toString(16) +
    	arr[off + 3].toString(16) +
    	arr[off + 4].toString(16) +
    	arr[off + 5].toString(16) +
    	arr[off + 6].toString(16) +
    	arr[off + 7].toString(16) +
    	arr[off + 8].toString(16) +
    	arr[off + 9].toString(16) +
    	arr[off + 10].toString(16) +
    	arr[off + 11].toString(16) +
    	arr[off + 12].toString(16) +
    	arr[off + 13].toString(16) +
    	arr[off + 14].toString(16) +
    	arr[off + 15].toString(16)
    );
}

//Little Endian
export function ReadUint16LE(arr, off) {

    if(arr.length < 2 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off + 1].toString(16) +
    	arr[off].toString(16)
    );
}

export function ReadUint32LE(arr, off) {
    if(arr.length < 4 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off + 3].toString(16) +
    	arr[off + 2].toString(16) +
    	arr[off + 1].toString(16) +
    	arr[off].toString(16)
    );
}

export function ReadUint64LE(arr, off) {

    if(arr.length < 8 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off + 7].toString(16) +
    	arr[off + 6].toString(16) +
    	arr[off + 5].toString(16) +
    	arr[off + 4].toString(16) +
    	arr[off + 3].toString(16) +
    	arr[off + 2].toString(16) +
    	arr[off + 1].toString(16) +
    	arr[off].toString(16)
    );
}

export function ReadUint128LE(arr, off) {

    if(arr.length < 16 || off > arr.length) //sanity check
        throw new Error('Cannot read OOB.');

    return parseInt("0x" +
    	arr[off + 15].toString(16) +
    	arr[off + 14].toString(16) +
    	arr[off + 13].toString(16) +
    	arr[off + 12].toString(16) +
    	arr[off + 11].toString(16) +
    	arr[off + 10].toString(16) +
    	arr[off + 9].toString(16) +
    	arr[off + 8].toString(16) +
    	arr[off + 7].toString(16) +
    	arr[off + 6].toString(16) +
    	arr[off + 5].toString(16) +
    	arr[off + 4].toString(16) +
    	arr[off + 3].toString(16) +
    	arr[off + 2].toString(16) +
    	arr[off + 1].toString(16) +
    	arr[off].toString(16)
    );
}

export function writeUint8(arr, off, val) {
    if(arr.length < 2 || off > arr.length || off < 0) {
        throw new Error('Cannot write OOB.');
    }


    if(val.length > 0xff)
        throw new Error('Invalid argument. This should be a valid 8-bit integer.');
    let old = arr[off];
    arr[off] = val;
}

export function writeUint16(arr, off, val) {
    if(arr.length < 4 || off > arr.length || off < 0) { //We should never underflow or overflow our buffer
        throw new Error('Cannot write OOB.');
    }


    if(val.length > 0xffff) //Values that after serialization never will be a 16 bit integer should never be treated
        throw new Error('Invalid argument. This should be a valid 16-bit integer.');

    let old = new Array(arr[off], arr[off+1]);

    if(val <= 0xff) { //Integers below 256 are always valid
        arr[off] = val;

    } else if(val > 0xff && val <= 0xfff) { //Integers bigger than 256 but below 4096 should be treated as two bytes instead of one and fixed with a leading zero
        arr[off] = parseInt('0x'+(val.toString(16).split('')[0] + val.toString(16).split('')[1]));
        arr[off+1] = parseInt('0x0'+val.toString(16).split('')[2]);

    } else if(val > 0xff && val <= 0xffff) { //Integers bigger than 256 and below 65535 should be treated as two bytes and can be splitted without having to fix them with a leading zero
        arr[off] = parseInt('0x'+(val.toString(16).split('')[0] + val.toString(16).split('')[1]));
        arr[off+1] = parseInt('0x'+val.toString(16).split('')[2] + val.toString(16).split('')[3]);

    }

}
