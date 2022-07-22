export class Reader {
    constructor( endian, word ) {
        this.endian = null
        this.word = 4

        if (endian)
            this.setEndian(endian)
        if (word)
            this.setWord(word)
    }

    setEndian(endian) {
        this.endian = /le|lsb|little/i.test(endian) ? 'le' : 'be';
    }

    setWord(word) {
        this.word = word;
    }

    readUInt8(buf, offset) {
        return buf.readUInt8(offset);
    }

    readInt8(buf, offset) {
        return buf.readInt8(offset);
    }

    readUInt16(buf, offset) {
        if (this.endian === 'le')
            return buf.readUInt16LE(offset);
        else
            return buf.readUInt16BE(offset);
    }

    readInt16(buf, offset) {
        if (this.endian === 'le')
            return buf.readInt16LE(offset);
        else
            return buf.readInt16BE(offset);
    }

    readUInt32(buf, offset) {
        if (this.endian === 'le')
            return buf.readUInt32LE(offset);
        else
            return buf.readUInt32BE(offset);
    }

    readInt32(buf, offset) {
        if (this.endian === 'le')
            return buf.readInt32LE(offset);
        else
            return buf.readInt32BE(offset);
    }

    readUInt64(buf, offset) {
        var a = this.readUInt32(buf, offset);
        var b = this.readUInt32(buf, offset + 4);
        if (this.endian === 'le')
            return a + b * 0x100000000;
        else
            return b + a * 0x100000000;
    }

    readInt64(buf, offset) {
        if (this.endian === 'le') {
            var a = this.readUInt32(buf, offset);
            var b = this.readInt32(buf, offset + 4);
            return a + b * 0x100000000;
        } else {
            var a = this.readInt32(buf, offset);
            var b = this.readUInt32(buf, offset + 4);
            return b + a * 0x100000000;
        }
    }

    readHalf(buf, offset) {
        if (this.word === 2)
            return this.readInt8(buf, offset);
        else if (this.word === 4)
            return this.readInt16(buf, offset);
        else
            return this.readInt32(buf, offset);
    }

    readUHalf(buf, offset) {
        if (this.word === 2)
            return this.readUInt8(buf, offset);
        else if (this.word === 4)
            return this.readUInt16(buf, offset);
        else
            return this.readUInt32(buf, offset);
    }

    readWord(buf, offset) {
        if (this.word === 1)
            return this.readInt8(buf, offset);
        else if (this.word === 2)
            return this.readInt16(buf, offset);
        else if (this.word === 4)
            return this.readInt32(buf, offset);
        else
            return this.readInt64(buf, offset);
    }

    readUWord(buf, offset) {
        if (this.word === 1)
            return this.readUInt8(buf, offset);
        else if (this.word === 2)
            return this.readUInt16(buf, offset);
        else if (this.word === 4)
            return this.readUInt32(buf, offset);
        else
            return this.readUInt64(buf, offset);
    }
}

// Reader.prototype.setEndian = function setEndian(endian) {
//     this.endian = /le|lsb|little/i.test(endian) ? 'le' : 'be';
// };

// Reader.prototype.setWord = function setWord(word) {
//     this.word = word;
// };

// Reader.prototype.readUInt8 = function readUInt8(buf, offset) {
//     return buf.readUInt8(offset);
// };

// Reader.prototype.readInt8 = function readInt8(buf, offset) {
//     return buf.readInt8(offset);
// };

// Reader.prototype.readUInt16 = function readUInt16(buf, offset) {
//     if (this.endian === 'le')
//         return buf.readUInt16LE(offset);
//     else
//         return buf.readUInt16BE(offset);
// };

// Reader.prototype.readInt16 = function readInt16(buf, offset) {
//     if (this.endian === 'le')
//         return buf.readInt16LE(offset);
//     else
//         return buf.readInt16BE(offset);
// };

// Reader.prototype.readUInt32 = function readUInt32(buf, offset) {
//     if (this.endian === 'le')
//         return buf.readUInt32LE(offset);
//     else
//         return buf.readUInt32BE(offset);
// };

// Reader.prototype.readInt32 = function readInt32(buf, offset) {
//     if (this.endian === 'le')
//         return buf.readInt32LE(offset);
//     else
//         return buf.readInt32BE(offset);
// };

// Reader.prototype.readUInt64 = function readUInt64(buf, offset) {
//     var a = this.readUInt32(buf, offset);
//     var b = this.readUInt32(buf, offset + 4);
//     if (this.endian === 'le')
//         return a + b * 0x100000000;
//     else
//         return b + a * 0x100000000;
// };

// Reader.prototype.readInt64 = function readInt64(buf, offset) {
//     if (this.endian === 'le') {
//         var a = this.readUInt32(buf, offset);
//         var b = this.readInt32(buf, offset + 4);
//         return a + b * 0x100000000;
//     } else {
//         var a = this.readInt32(buf, offset);
//         var b = this.readUInt32(buf, offset + 4);
//         return b + a * 0x100000000;
//     }
// };

// Reader.prototype.readHalf = function readHalf(buf, offset) {
//     if (this.word === 2)
//         return this.readInt8(buf, offset);
//     else if (this.word === 4)
//         return this.readInt16(buf, offset);
//     else
//         return this.readInt32(buf, offset);
// };

// Reader.prototype.readUHalf = function readUHalf(buf, offset) {
//     if (this.word === 2)
//         return this.readUInt8(buf, offset);
//     else if (this.word === 4)
//         return this.readUInt16(buf, offset);
//     else
//         return this.readUInt32(buf, offset);
// };

// Reader.prototype.readWord = function readWord(buf, offset) {
//     if (this.word === 1)
//         return this.readInt8(buf, offset);
//     else if (this.word === 2)
//         return this.readInt16(buf, offset);
//     else if (this.word === 4)
//         return this.readInt32(buf, offset);
//     else
//         return this.readInt64(buf, offset);
// };

// Reader.prototype.readUWord = function readUWord(buf, offset) {
//     if (this.word === 1)
//         return this.readUInt8(buf, offset);
//     else if (this.word === 2)
//         return this.readUInt16(buf, offset);
//     else if (this.word === 4)
//         return this.readUInt32(buf, offset);
//     else
//         return this.readUInt64(buf, offset);
// };
