(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.AV = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Asset, BufferSource, Decoder, Demuxer, EventEmitter, FileSource, HTTPSource,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('./core/events');

HTTPSource = require('./sources/node/http');

FileSource = require('./sources/node/file');

BufferSource = require('./sources/buffer');

Demuxer = require('./demuxer');

Decoder = require('./decoder');

Asset = (function(_super) {
  __extends(Asset, _super);

  function Asset(source) {
    this.source = source;
    this._decode = __bind(this._decode, this);
    this.findDecoder = __bind(this.findDecoder, this);
    this.probe = __bind(this.probe, this);
    this.buffered = 0;
    this.duration = null;
    this.format = null;
    this.metadata = null;
    this.active = false;
    this.demuxer = null;
    this.decoder = null;
    this.source.once('data', this.probe);
    this.source.on('error', (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.stop();
      };
    })(this));
    this.source.on('progress', (function(_this) {
      return function(buffered) {
        _this.buffered = buffered;
        return _this.emit('buffer', _this.buffered);
      };
    })(this));
  }

  Asset.fromURL = function(url, opts) {
    return new Asset(new HTTPSource(url, opts));
  };

  Asset.fromFile = function(file) {
    return new Asset(new FileSource(file));
  };

  Asset.fromBuffer = function(buffer) {
    return new Asset(new BufferSource(buffer));
  };

  Asset.prototype.start = function(decode) {
    if (this.active) {
      return;
    }
    if (decode != null) {
      this.shouldDecode = decode;
    }
    if (this.shouldDecode == null) {
      this.shouldDecode = true;
    }
    this.active = true;
    this.source.start();
    if (this.decoder && this.shouldDecode) {
      return this._decode();
    }
  };

  Asset.prototype.stop = function() {
    if (!this.active) {
      return;
    }
    this.active = false;
    return this.source.pause();
  };

  Asset.prototype.get = function(event, callback) {
    if (event !== 'format' && event !== 'duration' && event !== 'metadata') {
      return;
    }
    if (this[event] != null) {
      return callback(this[event]);
    } else {
      this.once(event, (function(_this) {
        return function(value) {
          _this.stop();
          return callback(value);
        };
      })(this));
      return this.start();
    }
  };

  Asset.prototype.decodePacket = function() {
    return this.decoder.decode();
  };

  Asset.prototype.decodeToBuffer = function(callback) {
    var chunks, dataHandler, length;
    length = 0;
    chunks = [];
    this.on('data', dataHandler = function(chunk) {
      length += chunk.length;
      return chunks.push(chunk);
    });
    this.once('end', function() {
      var buf, chunk, offset, _i, _len;
      buf = new Float32Array(length);
      offset = 0;
      for (_i = 0, _len = chunks.length; _i < _len; _i++) {
        chunk = chunks[_i];
        buf.set(chunk, offset);
        offset += chunk.length;
      }
      this.off('data', dataHandler);
      return callback(buf);
    });
    return this.start();
  };

  Asset.prototype.probe = function(chunk) {
    var demuxer;
    if (!this.active) {
      return;
    }
    demuxer = Demuxer.find(chunk);
    if (!demuxer) {
      return this.emit('error', 'A demuxer for this container was not found.');
    }
    this.demuxer = new demuxer(this.source, chunk);
    this.demuxer.on('format', this.findDecoder);
    this.demuxer.on('duration', (function(_this) {
      return function(duration) {
        _this.duration = duration;
        return _this.emit('duration', _this.duration);
      };
    })(this));
    this.demuxer.on('metadata', (function(_this) {
      return function(metadata) {
        _this.metadata = metadata;
        return _this.emit('metadata', _this.metadata);
      };
    })(this));
    return this.demuxer.on('error', (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.stop();
      };
    })(this));
  };

  Asset.prototype.findDecoder = function(format) {
    var decoder, div;
    this.format = format;
    if (!this.active) {
      return;
    }
    
    this.emit('format', this.format);
    decoder = Decoder.find(this.format.formatID);
    if (!decoder) {
      return this.emit('error', "A decoder for " + this.format.formatID + " was not found.");
    }
    this.decoder = new decoder(this.demuxer, this.format);
    console.log(this.decoder);
    if (this.format.floatingPoint) {
      this.decoder.on('data', (function(_this) {
        return function(buffer) {
          return _this.emit('data', buffer);
        };
      })(this));
    } else {
      div = Math.pow(2, this.format.bitsPerChannel - 1);
      this.decoder.on('data', (function(_this) {
        return function(buffer) {
          var buf, i, sample, _i, _len;
          buf = new Float32Array(buffer.length);
          for (i = _i = 0, _len = buffer.length; _i < _len; i = ++_i) {
            sample = buffer[i];
            buf[i] = sample / div;
          }
          return _this.emit('data', buf);
        };
      })(this));
    }
    this.decoder.on('error', (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.stop();
      };
    })(this));
    this.decoder.on('end', (function(_this) {
      return function() {
        return _this.emit('end');
      };
    })(this));
    this.emit('decodeStart');
    if (this.shouldDecode) {
      return this._decode();
    }
  };

  Asset.prototype._decode = function() {
    while (this.decoder.decode() && this.active) {
      continue;
    }
    if (this.active) {
      return this.decoder.once('data', this._decode);
    }
  };

  Asset.prototype.destroy = function() {
    var _ref, _ref1, _ref2;
    this.stop();
    if ((_ref = this.demuxer) != null) {
      _ref.off();
    }
    if ((_ref1 = this.decoder) != null) {
      _ref1.off();
    }
    if ((_ref2 = this.source) != null) {
      _ref2.off();
    }
    return this.off();
  };

  return Asset;

})(EventEmitter);

module.exports = Asset;

},{"./core/events":8,"./decoder":11,"./demuxer":14,"./sources/buffer":31,"./sources/node/file":29,"./sources/node/http":30}],2:[function(require,module,exports){
var key, val, _ref;

_ref = require('./aurora_base');
for (key in _ref) {
  val = _ref[key];
  exports[key] = val;
}

require('./demuxers/caf');

require('./demuxers/m4a');

require('./demuxers/aiff');

require('./demuxers/wave');

require('./demuxers/au');

require('./decoders/lpcm');

require('./decoders/xlaw');

},{"./aurora_base":3,"./decoders/lpcm":12,"./decoders/xlaw":13,"./demuxers/aiff":15,"./demuxers/au":16,"./demuxers/caf":17,"./demuxers/m4a":18,"./demuxers/wave":19}],3:[function(require,module,exports){
exports.Base = require('./core/base');

exports.Buffer = require('./core/buffer');

exports.BufferList = require('./core/bufferlist');

exports.Stream = require('./core/stream');

exports.Bitstream = require('./core/bitstream');

exports.EventEmitter = require('./core/events');

exports.UnderflowError = require('./core/underflow');

exports.HTTPSource = require('./sources/node/http');

exports.FileSource = require('./sources/node/file');

exports.BufferSource = require('./sources/buffer');

exports.Demuxer = require('./demuxer');

exports.Decoder = require('./decoder');

exports.AudioDevice = require('./device');

exports.Asset = require('./asset');

exports.Player = require('./player');

exports.Filter = require('./filter');

exports.VolumeFilter = require('./filters/volume');

exports.BalanceFilter = require('./filters/balance');

},{"./asset":1,"./core/base":4,"./core/bitstream":5,"./core/buffer":6,"./core/bufferlist":7,"./core/events":8,"./core/stream":9,"./core/underflow":10,"./decoder":11,"./demuxer":14,"./device":20,"./filter":24,"./filters/balance":25,"./filters/volume":26,"./player":27,"./sources/buffer":31,"./sources/node/file":29,"./sources/node/http":30}],4:[function(require,module,exports){
var Base,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Base = (function() {
  var fnTest;

  function Base() {}

  fnTest = /\b_super\b/;

  Base.extend = function(prop) {
    var Class, fn, key, keys, _ref, _super;
    Class = (function(_super) {
      __extends(Class, _super);

      function Class() {
        return Class.__super__.constructor.apply(this, arguments);
      }

      return Class;

    })(this);
    if (typeof prop === 'function') {
      keys = Object.keys(Class.prototype);
      prop.call(Class, Class);
      prop = {};
      _ref = Class.prototype;
      for (key in _ref) {
        fn = _ref[key];
        if (__indexOf.call(keys, key) < 0) {
          prop[key] = fn;
        }
      }
    }
    _super = Class.__super__;
    for (key in prop) {
      fn = prop[key];
      if (typeof fn === 'function' && fnTest.test(fn)) {
        (function(key, fn) {
          return Class.prototype[key] = function() {
            var ret, tmp;
            tmp = this._super;
            this._super = _super[key];
            ret = fn.apply(this, arguments);
            this._super = tmp;
            return ret;
          };
        })(key, fn);
      } else {
        Class.prototype[key] = fn;
      }
    }
    return Class;
  };

  return Base;

})();

module.exports = Base;

},{}],5:[function(require,module,exports){
var Bitstream;

Bitstream = (function() {
  function Bitstream(stream) {
    this.stream = stream;
    this.bitPosition = 0;
  }

  Bitstream.prototype.copy = function() {
    var result;
    result = new Bitstream(this.stream.copy());
    result.bitPosition = this.bitPosition;
    return result;
  };

  Bitstream.prototype.offset = function() {
    return 8 * this.stream.offset + this.bitPosition;
  };

  Bitstream.prototype.available = function(bits) {
    return this.stream.available((bits + 8 - this.bitPosition) / 8);
  };

  Bitstream.prototype.advance = function(bits) {
    var pos;
    pos = this.bitPosition + bits;
    this.stream.advance(pos >> 3);
    return this.bitPosition = pos & 7;
  };

  Bitstream.prototype.rewind = function(bits) {
    var pos;
    pos = this.bitPosition - bits;
    this.stream.rewind(Math.abs(pos >> 3));
    return this.bitPosition = pos & 7;
  };

  Bitstream.prototype.seek = function(offset) {
    var curOffset;
    curOffset = this.offset();
    if (offset > curOffset) {
      return this.advance(offset - curOffset);
    } else if (offset < curOffset) {
      return this.rewind(curOffset - offset);
    }
  };

  Bitstream.prototype.align = function() {
    if (this.bitPosition !== 0) {
      this.bitPosition = 0;
      return this.stream.advance(1);
    }
  };

  Bitstream.prototype.read = function(bits, signed) {
    var a, a0, a1, a2, a3, a4, mBits;
    if (bits === 0) {
      return 0;
    }
    mBits = bits + this.bitPosition;
    if (mBits <= 8) {
      a = ((this.stream.peekUInt8() << this.bitPosition) & 0xff) >>> (8 - bits);
    } else if (mBits <= 16) {
      a = ((this.stream.peekUInt16() << this.bitPosition) & 0xffff) >>> (16 - bits);
    } else if (mBits <= 24) {
      a = ((this.stream.peekUInt24() << this.bitPosition) & 0xffffff) >>> (24 - bits);
    } else if (mBits <= 32) {
      a = (this.stream.peekUInt32() << this.bitPosition) >>> (32 - bits);
    } else if (mBits <= 40) {
      a0 = this.stream.peekUInt8(0) * 0x0100000000;
      a1 = this.stream.peekUInt8(1) << 24 >>> 0;
      a2 = this.stream.peekUInt8(2) << 16;
      a3 = this.stream.peekUInt8(3) << 8;
      a4 = this.stream.peekUInt8(4);
      a = a0 + a1 + a2 + a3 + a4;
      a %= Math.pow(2, 40 - this.bitPosition);
      a = Math.floor(a / Math.pow(2, 40 - this.bitPosition - bits));
    } else {
      throw new Error("Too many bits!");
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    this.advance(bits);
    return a;
  };

  Bitstream.prototype.peek = function(bits, signed) {
    var a, a0, a1, a2, a3, a4, mBits;
    if (bits === 0) {
      return 0;
    }
    mBits = bits + this.bitPosition;
    if (mBits <= 8) {
      a = ((this.stream.peekUInt8() << this.bitPosition) & 0xff) >>> (8 - bits);
    } else if (mBits <= 16) {
      a = ((this.stream.peekUInt16() << this.bitPosition) & 0xffff) >>> (16 - bits);
    } else if (mBits <= 24) {
      a = ((this.stream.peekUInt24() << this.bitPosition) & 0xffffff) >>> (24 - bits);
    } else if (mBits <= 32) {
      a = (this.stream.peekUInt32() << this.bitPosition) >>> (32 - bits);
    } else if (mBits <= 40) {
      a0 = this.stream.peekUInt8(0) * 0x0100000000;
      a1 = this.stream.peekUInt8(1) << 24 >>> 0;
      a2 = this.stream.peekUInt8(2) << 16;
      a3 = this.stream.peekUInt8(3) << 8;
      a4 = this.stream.peekUInt8(4);
      a = a0 + a1 + a2 + a3 + a4;
      a %= Math.pow(2, 40 - this.bitPosition);
      a = Math.floor(a / Math.pow(2, 40 - this.bitPosition - bits));
    } else {
      throw new Error("Too many bits!");
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    return a;
  };

  Bitstream.prototype.readLSB = function(bits, signed) {
    var a, mBits;
    if (bits === 0) {
      return 0;
    }
    if (bits > 40) {
      throw new Error("Too many bits!");
    }
    mBits = bits + this.bitPosition;
    a = (this.stream.peekUInt8(0)) >>> this.bitPosition;
    if (mBits > 8) {
      a |= (this.stream.peekUInt8(1)) << (8 - this.bitPosition);
    }
    if (mBits > 16) {
      a |= (this.stream.peekUInt8(2)) << (16 - this.bitPosition);
    }
    if (mBits > 24) {
      a += (this.stream.peekUInt8(3)) << (24 - this.bitPosition) >>> 0;
    }
    if (mBits > 32) {
      a += (this.stream.peekUInt8(4)) * Math.pow(2, 32 - this.bitPosition);
    }
    if (mBits >= 32) {
      a %= Math.pow(2, bits);
    } else {
      a &= (1 << bits) - 1;
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    this.advance(bits);
    return a;
  };

  Bitstream.prototype.peekLSB = function(bits, signed) {
    var a, mBits;
    if (bits === 0) {
      return 0;
    }
    if (bits > 40) {
      throw new Error("Too many bits!");
    }
    mBits = bits + this.bitPosition;
    a = (this.stream.peekUInt8(0)) >>> this.bitPosition;
    if (mBits > 8) {
      a |= (this.stream.peekUInt8(1)) << (8 - this.bitPosition);
    }
    if (mBits > 16) {
      a |= (this.stream.peekUInt8(2)) << (16 - this.bitPosition);
    }
    if (mBits > 24) {
      a += (this.stream.peekUInt8(3)) << (24 - this.bitPosition) >>> 0;
    }
    if (mBits > 32) {
      a += (this.stream.peekUInt8(4)) * Math.pow(2, 32 - this.bitPosition);
    }
    if (mBits >= 32) {
      a %= Math.pow(2, bits);
    } else {
      a &= (1 << bits) - 1;
    }
    if (signed) {
      if (mBits < 32) {
        if (a >>> (bits - 1)) {
          a = ((1 << bits >>> 0) - a) * -1;
        }
      } else {
        if (a / Math.pow(2, bits - 1) | 0) {
          a = (Math.pow(2, bits) - a) * -1;
        }
      }
    }
    return a;
  };

  return Bitstream;

})();

module.exports = Bitstream;

},{}],6:[function(require,module,exports){
(function (global){
var AVBuffer;

AVBuffer = (function() {
  var BlobBuilder, URL;

  function AVBuffer(input) {
    var _ref;
    if (input instanceof Uint8Array) {
      this.data = input;
    } else if (input instanceof ArrayBuffer || Array.isArray(input) || typeof input === 'number' || ((_ref = global.Buffer) != null ? _ref.isBuffer(input) : void 0)) {
      this.data = new Uint8Array(input);
    } else if (input.buffer instanceof ArrayBuffer) {
      this.data = new Uint8Array(input.buffer, input.byteOffset, input.length * input.BYTES_PER_ELEMENT);
    } else if (input instanceof AVBuffer) {
      this.data = input.data;
    } else {
      throw new Error("Constructing buffer with unknown type.");
    }
    this.length = this.data.length;
    this.next = null;
    this.prev = null;
  }

  AVBuffer.allocate = function(size) {
    return new AVBuffer(size);
  };

  AVBuffer.prototype.copy = function() {
    return new AVBuffer(new Uint8Array(this.data));
  };

  AVBuffer.prototype.slice = function(position, length) {
    if (length == null) {
      length = this.length;
    }
    if (position === 0 && length >= this.length) {
      return new AVBuffer(this.data);
    } else {
      return new AVBuffer(this.data.subarray(position, position + length));
    }
  };

  BlobBuilder = global.BlobBuilder || global.MozBlobBuilder || global.WebKitBlobBuilder;

  URL = global.URL || global.webkitURL || global.mozURL;

  AVBuffer.makeBlob = function(data, type) {
    var bb;
    if (type == null) {
      type = 'application/octet-stream';
    }
    try {
      return new Blob([data], {
        type: type
      });
    } catch (_error) {}
    if (BlobBuilder != null) {
      bb = new BlobBuilder;
      bb.append(data);
      return bb.getBlob(type);
    }
    return null;
  };

  AVBuffer.makeBlobURL = function(data, type) {
    return URL != null ? URL.createObjectURL(this.makeBlob(data, type)) : void 0;
  };

  AVBuffer.revokeBlobURL = function(url) {
    return URL != null ? URL.revokeObjectURL(url) : void 0;
  };

  AVBuffer.prototype.toBlob = function() {
    return AVBuffer.makeBlob(this.data.buffer);
  };

  AVBuffer.prototype.toBlobURL = function() {
    return AVBuffer.makeBlobURL(this.data.buffer);
  };

  return AVBuffer;

})();

module.exports = AVBuffer;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],7:[function(require,module,exports){
var BufferList;

BufferList = (function() {
  function BufferList() {
    this.first = null;
    this.last = null;
    this.numBuffers = 0;
    this.availableBytes = 0;
    this.availableBuffers = 0;
  }

  BufferList.prototype.copy = function() {
    var result;
    result = new BufferList;
    result.first = this.first;
    result.last = this.last;
    result.numBuffers = this.numBuffers;
    result.availableBytes = this.availableBytes;
    result.availableBuffers = this.availableBuffers;
    return result;
  };

  BufferList.prototype.append = function(buffer) {
    var _ref;
    buffer.prev = this.last;
    if ((_ref = this.last) != null) {
      _ref.next = buffer;
    }
    this.last = buffer;
    if (this.first == null) {
      this.first = buffer;
    }
    this.availableBytes += buffer.length;
    this.availableBuffers++;
    return this.numBuffers++;
  };

  BufferList.prototype.advance = function() {
    if (this.first) {
      this.availableBytes -= this.first.length;
      this.availableBuffers--;
      this.first = this.first.next;
      return this.first != null;
    }
    return false;
  };

  BufferList.prototype.rewind = function() {
    var _ref;
    if (this.first && !this.first.prev) {
      return false;
    }
    this.first = ((_ref = this.first) != null ? _ref.prev : void 0) || this.last;
    if (this.first) {
      this.availableBytes += this.first.length;
      this.availableBuffers++;
    }
    return this.first != null;
  };

  BufferList.prototype.reset = function() {
    var _results;
    _results = [];
    while (this.rewind()) {
      continue;
    }
    return _results;
  };

  return BufferList;

})();

module.exports = BufferList;

},{}],8:[function(require,module,exports){
var Base, EventEmitter,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __slice = [].slice;

Base = require('./base');

EventEmitter = (function(_super) {
  __extends(EventEmitter, _super);

  function EventEmitter() {
    return EventEmitter.__super__.constructor.apply(this, arguments);
  }

  EventEmitter.prototype.on = function(event, fn) {
    var _base;
    if (this.events == null) {
      this.events = {};
    }
    if ((_base = this.events)[event] == null) {
      _base[event] = [];
    }
    return this.events[event].push(fn);
  };

  EventEmitter.prototype.off = function(event, fn) {
    var events, index, _ref;
    if (this.events == null) {
      return;
    }
    if ((_ref = this.events) != null ? _ref[event] : void 0) {
      if (fn != null) {
        index = this.events[event].indexOf(fn);
        if (~index) {
          return this.events[event].splice(index, 1);
        }
      } else {
        return this.events[event];
      }
    } else if (event == null) {
      return events = {};
    }
  };

  EventEmitter.prototype.once = function(event, fn) {
    var cb;
    return this.on(event, cb = function() {
      this.off(event, cb);
      return fn.apply(this, arguments);
    });
  };

  EventEmitter.prototype.emit = function() {
    var args, event, fn, _i, _len, _ref, _ref1;
    event = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    if (!((_ref = this.events) != null ? _ref[event] : void 0)) {
      return;
    }
    _ref1 = this.events[event].slice();
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      fn = _ref1[_i];
      fn.apply(this, args);
    }
  };

  return EventEmitter;

})(Base);

module.exports = EventEmitter;

},{"./base":4}],9:[function(require,module,exports){
var AVBuffer, BufferList, Stream, UnderflowError;

BufferList = require('./bufferlist');

AVBuffer = require('./buffer');

UnderflowError = require('./underflow');

Stream = (function() {
  var buf, decodeString, float32, float64, float64Fallback, float80, int16, int32, int8, nativeEndian, uint16, uint32, uint8;

  buf = new ArrayBuffer(16);

  uint8 = new Uint8Array(buf);

  int8 = new Int8Array(buf);

  uint16 = new Uint16Array(buf);

  int16 = new Int16Array(buf);

  uint32 = new Uint32Array(buf);

  int32 = new Int32Array(buf);

  float32 = new Float32Array(buf);

  if (typeof Float64Array !== "undefined" && Float64Array !== null) {
    float64 = new Float64Array(buf);
  }

  nativeEndian = new Uint16Array(new Uint8Array([0x12, 0x34]).buffer)[0] === 0x3412;

  function Stream(list) {
    this.list = list;
    this.localOffset = 0;
    this.offset = 0;
  }

  Stream.fromBuffer = function(buffer) {
    var list;
    list = new BufferList;
    list.append(buffer);
    return new Stream(list);
  };

  Stream.prototype.copy = function() {
    var result;
    result = new Stream(this.list.copy());
    result.localOffset = this.localOffset;
    result.offset = this.offset;
    return result;
  };

  Stream.prototype.available = function(bytes) {
    return bytes <= this.list.availableBytes - this.localOffset;
  };

  Stream.prototype.remainingBytes = function() {
    return this.list.availableBytes - this.localOffset;
  };

  Stream.prototype.advance = function(bytes) {
    if (!this.available(bytes)) {
      throw new UnderflowError();
    }
    this.localOffset += bytes;
    this.offset += bytes;
    while (this.list.first && this.localOffset >= this.list.first.length) {
      this.localOffset -= this.list.first.length;
      this.list.advance();
    }
    return this;
  };

  Stream.prototype.rewind = function(bytes) {
    if (bytes > this.offset) {
      throw new UnderflowError();
    }
    if (!this.list.first) {
      this.list.rewind();
      this.localOffset = this.list.first.length;
    }
    this.localOffset -= bytes;
    this.offset -= bytes;
    while (this.list.first.prev && this.localOffset < 0) {
      this.list.rewind();
      this.localOffset += this.list.first.length;
    }
    return this;
  };

  Stream.prototype.seek = function(position) {
    if (position > this.offset) {
      return this.advance(position - this.offset);
    } else if (position < this.offset) {
      return this.rewind(this.offset - position);
    }
  };

  Stream.prototype.readUInt8 = function() {
    var a;
    if (!this.available(1)) {
      throw new UnderflowError();
    }
    a = this.list.first.data[this.localOffset];
    this.localOffset += 1;
    this.offset += 1;
    if (this.localOffset === this.list.first.length) {
      this.localOffset = 0;
      this.list.advance();
    }
    return a;
  };

  Stream.prototype.peekUInt8 = function(offset) {
    var buffer;
    if (offset == null) {
      offset = 0;
    }
    if (!this.available(offset + 1)) {
      throw new UnderflowError();
    }
    offset = this.localOffset + offset;
    buffer = this.list.first;
    while (buffer) {
      if (buffer.length > offset) {
        return buffer.data[offset];
      }
      offset -= buffer.length;
      buffer = buffer.next;
    }
    return 0;
  };

  Stream.prototype.read = function(bytes, littleEndian) {
    var i, _i, _j, _ref;
    if (littleEndian == null) {
      littleEndian = false;
    }
    if (littleEndian === nativeEndian) {
      for (i = _i = 0; _i < bytes; i = _i += 1) {
        uint8[i] = this.readUInt8();
      }
    } else {
      for (i = _j = _ref = bytes - 1; _j >= 0; i = _j += -1) {
        uint8[i] = this.readUInt8();
      }
    }
  };

  Stream.prototype.peek = function(bytes, offset, littleEndian) {
    var i, _i, _j;
    if (littleEndian == null) {
      littleEndian = false;
    }
    if (littleEndian === nativeEndian) {
      for (i = _i = 0; _i < bytes; i = _i += 1) {
        uint8[i] = this.peekUInt8(offset + i);
      }
    } else {
      for (i = _j = 0; _j < bytes; i = _j += 1) {
        uint8[bytes - i - 1] = this.peekUInt8(offset + i);
      }
    }
  };

  Stream.prototype.readInt8 = function() {
    this.read(1);
    return int8[0];
  };

  Stream.prototype.peekInt8 = function(offset) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(1, offset);
    return int8[0];
  };

  Stream.prototype.readUInt16 = function(littleEndian) {
    this.read(2, littleEndian);
    return uint16[0];
  };

  Stream.prototype.peekUInt16 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(2, offset, littleEndian);
    return uint16[0];
  };

  Stream.prototype.readInt16 = function(littleEndian) {
    this.read(2, littleEndian);
    return int16[0];
  };

  Stream.prototype.peekInt16 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(2, offset, littleEndian);
    return int16[0];
  };

  Stream.prototype.readUInt24 = function(littleEndian) {
    if (littleEndian) {
      return this.readUInt16(true) + (this.readUInt8() << 16);
    } else {
      return (this.readUInt16() << 8) + this.readUInt8();
    }
  };

  Stream.prototype.peekUInt24 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    if (littleEndian) {
      return this.peekUInt16(offset, true) + (this.peekUInt8(offset + 2) << 16);
    } else {
      return (this.peekUInt16(offset) << 8) + this.peekUInt8(offset + 2);
    }
  };

  Stream.prototype.readInt24 = function(littleEndian) {
    if (littleEndian) {
      return this.readUInt16(true) + (this.readInt8() << 16);
    } else {
      return (this.readInt16() << 8) + this.readUInt8();
    }
  };

  Stream.prototype.peekInt24 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    if (littleEndian) {
      return this.peekUInt16(offset, true) + (this.peekInt8(offset + 2) << 16);
    } else {
      return (this.peekInt16(offset) << 8) + this.peekUInt8(offset + 2);
    }
  };

  Stream.prototype.readUInt32 = function(littleEndian) {
    this.read(4, littleEndian);
    return uint32[0];
  };

  Stream.prototype.peekUInt32 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(4, offset, littleEndian);
    return uint32[0];
  };

  Stream.prototype.readInt32 = function(littleEndian) {
    this.read(4, littleEndian);
    return int32[0];
  };

  Stream.prototype.peekInt32 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(4, offset, littleEndian);
    return int32[0];
  };

  Stream.prototype.readFloat32 = function(littleEndian) {
    this.read(4, littleEndian);
    return float32[0];
  };

  Stream.prototype.peekFloat32 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(4, offset, littleEndian);
    return float32[0];
  };

  Stream.prototype.readFloat64 = function(littleEndian) {
    this.read(8, littleEndian);
    if (float64) {
      return float64[0];
    } else {
      return float64Fallback();
    }
  };

  float64Fallback = function() {
    var exp, frac, high, low, out, sign;
    low = uint32[0], high = uint32[1];
    if (!high || high === 0x80000000) {
      return 0.0;
    }
    sign = 1 - (high >>> 31) * 2;
    exp = (high >>> 20) & 0x7ff;
    frac = high & 0xfffff;
    if (exp === 0x7ff) {
      if (frac) {
        return NaN;
      }
      return sign * Infinity;
    }
    exp -= 1023;
    out = (frac | 0x100000) * Math.pow(2, exp - 20);
    out += low * Math.pow(2, exp - 52);
    return sign * out;
  };

  Stream.prototype.peekFloat64 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(8, offset, littleEndian);
    if (float64) {
      return float64[0];
    } else {
      return float64Fallback();
    }
  };

  Stream.prototype.readFloat80 = function(littleEndian) {
    this.read(10, littleEndian);
    return float80();
  };

  float80 = function() {
    var a0, a1, exp, high, low, out, sign;
    high = uint32[0], low = uint32[1];
    a0 = uint8[9];
    a1 = uint8[8];
    sign = 1 - (a0 >>> 7) * 2;
    exp = ((a0 & 0x7F) << 8) | a1;
    if (exp === 0 && low === 0 && high === 0) {
      return 0;
    }
    if (exp === 0x7fff) {
      if (low === 0 && high === 0) {
        return sign * Infinity;
      }
      return NaN;
    }
    exp -= 16383;
    out = low * Math.pow(2, exp - 31);
    out += high * Math.pow(2, exp - 63);
    return sign * out;
  };

  Stream.prototype.peekFloat80 = function(offset, littleEndian) {
    if (offset == null) {
      offset = 0;
    }
    this.peek(10, offset, littleEndian);
    return float80();
  };

  Stream.prototype.readBuffer = function(length) {
    var i, result, to, _i;
    result = AVBuffer.allocate(length);
    to = result.data;
    for (i = _i = 0; _i < length; i = _i += 1) {
      to[i] = this.readUInt8();
    }
    return result;
  };

  Stream.prototype.peekBuffer = function(offset, length) {
    var i, result, to, _i;
    if (offset == null) {
      offset = 0;
    }
    result = AVBuffer.allocate(length);
    to = result.data;
    for (i = _i = 0; _i < length; i = _i += 1) {
      to[i] = this.peekUInt8(offset + i);
    }
    return result;
  };

  Stream.prototype.readSingleBuffer = function(length) {
    var result;
    result = this.list.first.slice(this.localOffset, length);
    this.advance(result.length);
    return result;
  };

  Stream.prototype.peekSingleBuffer = function(offset, length) {
    var result;
    result = this.list.first.slice(this.localOffset + offset, length);
    return result;
  };

  Stream.prototype.readString = function(length, encoding) {
    if (encoding == null) {
      encoding = 'ascii';
    }
    return decodeString.call(this, 0, length, encoding, true);
  };

  Stream.prototype.peekString = function(offset, length, encoding) {
    if (offset == null) {
      offset = 0;
    }
    if (encoding == null) {
      encoding = 'ascii';
    }
    return decodeString.call(this, offset, length, encoding, false);
  };

  decodeString = function(offset, length, encoding, advance) {
    var b1, b2, b3, b4, bom, c, end, littleEndian, nullEnd, pt, result, w1, w2;
    encoding = encoding.toLowerCase();
    nullEnd = length === null ? 0 : -1;
    if (length == null) {
      length = Infinity;
    }
    end = offset + length;
    result = '';
    switch (encoding) {
      case 'ascii':
      case 'latin1':
        while (offset < end && (c = this.peekUInt8(offset++)) !== nullEnd) {
          result += String.fromCharCode(c);
        }
        break;
      case 'utf8':
      case 'utf-8':
        while (offset < end && (b1 = this.peekUInt8(offset++)) !== nullEnd) {
          if ((b1 & 0x80) === 0) {
            result += String.fromCharCode(b1);
          } else if ((b1 & 0xe0) === 0xc0) {
            b2 = this.peekUInt8(offset++) & 0x3f;
            result += String.fromCharCode(((b1 & 0x1f) << 6) | b2);
          } else if ((b1 & 0xf0) === 0xe0) {
            b2 = this.peekUInt8(offset++) & 0x3f;
            b3 = this.peekUInt8(offset++) & 0x3f;
            result += String.fromCharCode(((b1 & 0x0f) << 12) | (b2 << 6) | b3);
          } else if ((b1 & 0xf8) === 0xf0) {
            b2 = this.peekUInt8(offset++) & 0x3f;
            b3 = this.peekUInt8(offset++) & 0x3f;
            b4 = this.peekUInt8(offset++) & 0x3f;
            pt = (((b1 & 0x0f) << 18) | (b2 << 12) | (b3 << 6) | b4) - 0x10000;
            result += String.fromCharCode(0xd800 + (pt >> 10), 0xdc00 + (pt & 0x3ff));
          }
        }
        break;
      case 'utf16-be':
      case 'utf16be':
      case 'utf16le':
      case 'utf16-le':
      case 'utf16bom':
      case 'utf16-bom':
        switch (encoding) {
          case 'utf16be':
          case 'utf16-be':
            littleEndian = false;
            break;
          case 'utf16le':
          case 'utf16-le':
            littleEndian = true;
            break;
          case 'utf16bom':
          case 'utf16-bom':
            if (length < 2 || (bom = this.peekUInt16(offset)) === nullEnd) {
              if (advance) {
                this.advance(offset += 2);
              }
              return result;
            }
            littleEndian = bom === 0xfffe;
            offset += 2;
        }
        while (offset < end && (w1 = this.peekUInt16(offset, littleEndian)) !== nullEnd) {
          offset += 2;
          if (w1 < 0xd800 || w1 > 0xdfff) {
            result += String.fromCharCode(w1);
          } else {
            if (w1 > 0xdbff) {
              throw new Error("Invalid utf16 sequence.");
            }
            w2 = this.peekUInt16(offset, littleEndian);
            if (w2 < 0xdc00 || w2 > 0xdfff) {
              throw new Error("Invalid utf16 sequence.");
            }
            result += String.fromCharCode(w1, w2);
            offset += 2;
          }
        }
        if (w1 === nullEnd) {
          offset += 2;
        }
        break;
      default:
        throw new Error("Unknown encoding: " + encoding);
    }
    if (advance) {
      this.advance(offset);
    }
    return result;
  };

  return Stream;

})();

module.exports = Stream;

},{"./buffer":6,"./bufferlist":7,"./underflow":10}],10:[function(require,module,exports){
var UnderflowError,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

UnderflowError = (function(_super) {
  __extends(UnderflowError, _super);

  function UnderflowError() {
    UnderflowError.__super__.constructor.apply(this, arguments);
    this.name = 'UnderflowError';
    this.stack = new Error().stack;
  }

  return UnderflowError;

})(Error);

module.exports = UnderflowError;

},{}],11:[function(require,module,exports){
var Bitstream, BufferList, Decoder, EventEmitter, Stream, UnderflowError,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('./core/events');

BufferList = require('./core/bufferlist');

Stream = require('./core/stream');

Bitstream = require('./core/bitstream');

UnderflowError = require('./core/underflow');

Decoder = (function(_super) {
  var codecs;

  __extends(Decoder, _super);

  function Decoder(demuxer, format) {
    var list;
    this.demuxer = demuxer;
    this.format = format;
    list = new BufferList;
    this.stream = new Stream(list);
    this.bitstream = new Bitstream(this.stream);
    this.receivedFinalBuffer = false;
    this.waiting = false;
    this.demuxer.on('cookie', (function(_this) {
      return function(cookie) {
        var error;
        try {
          return _this.setCookie(cookie);
        } catch (_error) {
          error = _error;
          return _this.emit('error', error);
        }
      };
    })(this));
    this.demuxer.on('data', (function(_this) {
      return function(chunk) {
        list.append(chunk);
        if (_this.waiting) {
          return _this.decode();
        }
      };
    })(this));
    this.demuxer.on('end', (function(_this) {
      return function() {
        _this.receivedFinalBuffer = true;
        if (_this.waiting) {
          return _this.decode();
        }
      };
    })(this));
    this.init();
  }

  Decoder.prototype.init = function() {};

  Decoder.prototype.setCookie = function(cookie) {};

  Decoder.prototype.readChunk = function() {};

  Decoder.prototype.decode = function() {
    var error, offset, packet;
    this.waiting = !this.receivedFinalBuffer;
    offset = this.bitstream.offset();
    try {
      packet = this.readChunk();
    } catch (_error) {
      error = _error;
      if (!(error instanceof UnderflowError)) {
        this.emit('error', error);
        return false;
      }
    }
    if (packet) {
      this.emit('data', packet);
      if (this.receivedFinalBuffer) {
        this.emit('end');
      }
      return true;
    } else if (!this.receivedFinalBuffer) {
      this.bitstream.seek(offset);
      this.waiting = true;
    } else {
      this.emit('end');
    }
    return false;
  };

  Decoder.prototype.seek = function(timestamp) {
    var seekPoint;
    seekPoint = this.demuxer.seek(timestamp);
    this.stream.seek(seekPoint.offset);
    return seekPoint.timestamp;
  };

  codecs = {};

  Decoder.register = function(id, decoder) {
    return codecs[id] = decoder;
  };

  Decoder.find = function(id) {
    return codecs[id] || null;
  };

  return Decoder;

})(EventEmitter);

module.exports = Decoder;

},{"./core/bitstream":5,"./core/bufferlist":7,"./core/events":8,"./core/stream":9,"./core/underflow":10}],12:[function(require,module,exports){
var Decoder, LPCMDecoder,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Decoder = require('../decoder');

LPCMDecoder = (function(_super) {
  __extends(LPCMDecoder, _super);

  function LPCMDecoder() {
    this.readChunk = __bind(this.readChunk, this);
    return LPCMDecoder.__super__.constructor.apply(this, arguments);
  }

  Decoder.register('lpcm', LPCMDecoder);

  LPCMDecoder.prototype.readChunk = function() {
    var chunkSize, i, littleEndian, output, samples, stream, _i, _j, _k, _l, _m, _n;
    stream = this.stream;
    littleEndian = this.format.littleEndian;
    chunkSize = Math.min(4096, stream.remainingBytes());
    samples = chunkSize / (this.format.bitsPerChannel / 8) | 0;
    if (chunkSize < this.format.bitsPerChannel / 8) {
      return null;
    }
    if (this.format.floatingPoint) {
      switch (this.format.bitsPerChannel) {
        case 32:
          output = new Float32Array(samples);
          for (i = _i = 0; _i < samples; i = _i += 1) {
            output[i] = stream.readFloat32(littleEndian);
          }
          break;
        case 64:
          output = new Float64Array(samples);
          for (i = _j = 0; _j < samples; i = _j += 1) {
            output[i] = stream.readFloat64(littleEndian);
          }
          break;
        default:
          throw new Error('Unsupported bit depth.');
      }
    } else {
      switch (this.format.bitsPerChannel) {
        case 8:
          output = new Int8Array(samples);
          for (i = _k = 0; _k < samples; i = _k += 1) {
            output[i] = stream.readInt8();
          }
          break;
        case 16:
          output = new Int16Array(samples);
          for (i = _l = 0; _l < samples; i = _l += 1) {
            output[i] = stream.readInt16(littleEndian);
          }
          break;
        case 24:
          output = new Int32Array(samples);
          for (i = _m = 0; _m < samples; i = _m += 1) {
            output[i] = stream.readInt24(littleEndian);
          }
          break;
        case 32:
          output = new Int32Array(samples);
          for (i = _n = 0; _n < samples; i = _n += 1) {
            output[i] = stream.readInt32(littleEndian);
          }
          break;
        default:
          throw new Error('Unsupported bit depth.');
      }
    }
    return output;
  };

  return LPCMDecoder;

})(Decoder);

},{"../decoder":11}],13:[function(require,module,exports){
var Decoder, XLAWDecoder,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Decoder = require('../decoder');

XLAWDecoder = (function(_super) {
  var BIAS, QUANT_MASK, SEG_MASK, SEG_SHIFT, SIGN_BIT;

  __extends(XLAWDecoder, _super);

  function XLAWDecoder() {
    this.readChunk = __bind(this.readChunk, this);
    return XLAWDecoder.__super__.constructor.apply(this, arguments);
  }

  Decoder.register('ulaw', XLAWDecoder);

  Decoder.register('alaw', XLAWDecoder);

  SIGN_BIT = 0x80;

  QUANT_MASK = 0xf;

  SEG_SHIFT = 4;

  SEG_MASK = 0x70;

  BIAS = 0x84;

  XLAWDecoder.prototype.init = function() {
    var i, seg, t, table, val, _i, _j;
    this.format.bitsPerChannel = 16;
    this.table = table = new Int16Array(256);
    if (this.format.formatID === 'ulaw') {
      for (i = _i = 0; _i < 256; i = ++_i) {
        val = ~i;
        t = ((val & QUANT_MASK) << 3) + BIAS;
        t <<= (val & SEG_MASK) >>> SEG_SHIFT;
        table[i] = val & SIGN_BIT ? BIAS - t : t - BIAS;
      }
    } else {
      for (i = _j = 0; _j < 256; i = ++_j) {
        val = i ^ 0x55;
        t = val & QUANT_MASK;
        seg = (val & SEG_MASK) >>> SEG_SHIFT;
        if (seg) {
          t = (t + t + 1 + 32) << (seg + 2);
        } else {
          t = (t + t + 1) << 3;
        }
        table[i] = val & SIGN_BIT ? t : -t;
      }
    }
  };

  XLAWDecoder.prototype.readChunk = function() {
    var i, output, samples, stream, table, _i;
    stream = this.stream, table = this.table;
    samples = Math.min(4096, this.stream.remainingBytes());
    if (samples === 0) {
      return;
    }
    output = new Int16Array(samples);
    for (i = _i = 0; _i < samples; i = _i += 1) {
      output[i] = table[stream.readUInt8()];
    }
    return output;
  };

  return XLAWDecoder;

})(Decoder);

},{"../decoder":11}],14:[function(require,module,exports){
var BufferList, Demuxer, EventEmitter, Stream,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('./core/events');

BufferList = require('./core/bufferlist');

Stream = require('./core/stream');

Demuxer = (function(_super) {
  var formats;

  __extends(Demuxer, _super);

  Demuxer.probe = function(buffer) {
    return false;
  };

  function Demuxer(source, chunk) {
    var list, received;
    list = new BufferList;
    list.append(chunk);
    this.stream = new Stream(list);
    received = false;
    source.on('data', (function(_this) {
      return function(chunk) {
        var e;
        received = true;
        list.append(chunk);
        try {
          return _this.readChunk(chunk);
        } catch (_error) {
          e = _error;
          return _this.emit('error', e);
        }
      };
    })(this));
    source.on('error', (function(_this) {
      return function(err) {
        return _this.emit('error', err);
      };
    })(this));
    source.on('end', (function(_this) {
      return function() {
        if (!received) {
          _this.readChunk(chunk);
        }
        return _this.emit('end');
      };
    })(this));
    this.seekPoints = [];
    this.init();
  }

  Demuxer.prototype.init = function() {};

  Demuxer.prototype.readChunk = function(chunk) {};

  Demuxer.prototype.addSeekPoint = function(offset, timestamp) {
    var index;
    index = this.searchTimestamp(timestamp);
    return this.seekPoints.splice(index, 0, {
      offset: offset,
      timestamp: timestamp
    });
  };

  Demuxer.prototype.searchTimestamp = function(timestamp, backward) {
    var high, low, mid, time;
    low = 0;
    high = this.seekPoints.length;
    if (high > 0 && this.seekPoints[high - 1].timestamp < timestamp) {
      return high;
    }
    while (low < high) {
      mid = (low + high) >> 1;
      time = this.seekPoints[mid].timestamp;
      if (time < timestamp) {
        low = mid + 1;
      } else if (time >= timestamp) {
        high = mid;
      }
    }
    if (high > this.seekPoints.length) {
      high = this.seekPoints.length;
    }
    return high;
  };

  Demuxer.prototype.seek = function(timestamp) {
    var index, seekPoint;
    if (this.format && this.format.framesPerPacket > 0 && this.format.bytesPerPacket > 0) {
      seekPoint = {
        timestamp: timestamp,
        offset: this.format.bytesPerPacket * timestamp / this.format.framesPerPacket
      };
      return seekPoint;
    } else {
      index = this.searchTimestamp(timestamp);
      return this.seekPoints[index];
    }
  };

  formats = [];

  Demuxer.register = function(demuxer) {
    return formats.push(demuxer);
  };

  Demuxer.find = function(buffer) {
    var e, format, offset, stream, _i, _len;
    stream = Stream.fromBuffer(buffer);
    for (_i = 0, _len = formats.length; _i < _len; _i++) {
      format = formats[_i];
      offset = stream.offset;
      try {
        if (format.probe(stream)) {
          return format;
        }
      } catch (_error) {
        e = _error;
      }
      stream.seek(offset);
    }
    return null;
  };

  return Demuxer;

})(EventEmitter);

module.exports = Demuxer;

},{"./core/bufferlist":7,"./core/events":8,"./core/stream":9}],15:[function(require,module,exports){
var AIFFDemuxer, Demuxer,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Demuxer = require('../demuxer');

AIFFDemuxer = (function(_super) {
  __extends(AIFFDemuxer, _super);

  function AIFFDemuxer() {
    return AIFFDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(AIFFDemuxer);

  AIFFDemuxer.probe = function(buffer) {
    var _ref;
    return buffer.peekString(0, 4) === 'FORM' && ((_ref = buffer.peekString(8, 4)) === 'AIFF' || _ref === 'AIFC');
  };

  AIFFDemuxer.prototype.readChunk = function() {
    var buffer, format, offset, _ref;
    if (!this.readStart && this.stream.available(12)) {
      if (this.stream.readString(4) !== 'FORM') {
        return this.emit('error', 'Invalid AIFF.');
      }
      this.fileSize = this.stream.readUInt32();
      this.fileType = this.stream.readString(4);
      this.readStart = true;
      if ((_ref = this.fileType) !== 'AIFF' && _ref !== 'AIFC') {
        return this.emit('error', 'Invalid AIFF.');
      }
    }
    while (this.stream.available(1)) {
      if (!this.readHeaders && this.stream.available(8)) {
        this.type = this.stream.readString(4);
        this.len = this.stream.readUInt32();
      }
      switch (this.type) {
        case 'COMM':
          if (!this.stream.available(this.len)) {
            return;
          }
          this.format = {
            formatID: 'lpcm',
            channelsPerFrame: this.stream.readUInt16(),
            sampleCount: this.stream.readUInt32(),
            bitsPerChannel: this.stream.readUInt16(),
            sampleRate: this.stream.readFloat80(),
            framesPerPacket: 1,
            littleEndian: false,
            floatingPoint: false
          };
          this.format.bytesPerPacket = (this.format.bitsPerChannel / 8) * this.format.channelsPerFrame;
          if (this.fileType === 'AIFC') {
            format = this.stream.readString(4);
            this.format.littleEndian = format === 'sowt' && this.format.bitsPerChannel > 8;
            this.format.floatingPoint = format === 'fl32' || format === 'fl64';
            if (format === 'twos' || format === 'sowt' || format === 'fl32' || format === 'fl64' || format === 'NONE') {
              format = 'lpcm';
            }
            this.format.formatID = format;
            this.len -= 4;
          }
          this.stream.advance(this.len - 18);
          this.emit('format', this.format);
          this.emit('duration', this.format.sampleCount / this.format.sampleRate * 1000 | 0);
          break;
        case 'SSND':
          if (!(this.readSSNDHeader && this.stream.available(4))) {
            offset = this.stream.readUInt32();
            this.stream.advance(4);
            this.stream.advance(offset);
            this.readSSNDHeader = true;
          }
          buffer = this.stream.readSingleBuffer(this.len);
          this.len -= buffer.length;
          this.readHeaders = this.len > 0;
          this.emit('data', buffer);
          break;
        default:
          if (!this.stream.available(this.len)) {
            return;
          }
          this.stream.advance(this.len);
      }
      if (this.type !== 'SSND') {
        this.readHeaders = false;
      }
    }
  };

  return AIFFDemuxer;

})(Demuxer);

},{"../demuxer":14}],16:[function(require,module,exports){
var AUDemuxer, Demuxer,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Demuxer = require('../demuxer');

AUDemuxer = (function(_super) {
  var bps, formats;

  __extends(AUDemuxer, _super);

  function AUDemuxer() {
    return AUDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(AUDemuxer);

  AUDemuxer.probe = function(buffer) {
    return buffer.peekString(0, 4) === '.snd';
  };

  bps = [8, 8, 16, 24, 32, 32, 64];

  bps[26] = 8;

  formats = {
    1: 'ulaw',
    27: 'alaw'
  };

  AUDemuxer.prototype.readChunk = function() {
    var bytes, dataSize, encoding, size;
    if (!this.readHeader && this.stream.available(24)) {
      if (this.stream.readString(4) !== '.snd') {
        return this.emit('error', 'Invalid AU file.');
      }
      size = this.stream.readUInt32();
      dataSize = this.stream.readUInt32();
      encoding = this.stream.readUInt32();
      this.format = {
        formatID: formats[encoding] || 'lpcm',
        littleEndian: false,
        floatingPoint: encoding === 6 || encoding === 7,
        bitsPerChannel: bps[encoding - 1],
        sampleRate: this.stream.readUInt32(),
        channelsPerFrame: this.stream.readUInt32(),
        framesPerPacket: 1
      };
      if (this.format.bitsPerChannel == null) {
        return this.emit('error', 'Unsupported encoding in AU file.');
      }
      this.format.bytesPerPacket = (this.format.bitsPerChannel / 8) * this.format.channelsPerFrame;
      if (dataSize !== 0xffffffff) {
        bytes = this.format.bitsPerChannel / 8;
        this.emit('duration', dataSize / bytes / this.format.channelsPerFrame / this.format.sampleRate * 1000 | 0);
      }
      this.emit('format', this.format);
      this.readHeader = true;
    }
    if (this.readHeader) {
      while (this.stream.available(1)) {
        this.emit('data', this.stream.readSingleBuffer(this.stream.remainingBytes()));
      }
    }
  };

  return AUDemuxer;

})(Demuxer);

},{"../demuxer":14}],17:[function(require,module,exports){
var CAFDemuxer, Demuxer, M4ADemuxer,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Demuxer = require('../demuxer');

M4ADemuxer = require('./m4a');

CAFDemuxer = (function(_super) {
  __extends(CAFDemuxer, _super);

  function CAFDemuxer() {
    return CAFDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(CAFDemuxer);

  CAFDemuxer.probe = function(buffer) {
    return buffer.peekString(0, 4) === 'caff';
  };

  CAFDemuxer.prototype.readChunk = function() {
    var buffer, byteOffset, cookie, entries, flags, i, key, metadata, offset, sampleOffset, value, _i, _j, _ref;
    if (!this.format && this.stream.available(64)) {
      if (this.stream.readString(4) !== 'caff') {
        return this.emit('error', "Invalid CAF, does not begin with 'caff'");
      }
      this.stream.advance(4);
      if (this.stream.readString(4) !== 'desc') {
        return this.emit('error', "Invalid CAF, 'caff' is not followed by 'desc'");
      }
      if (!(this.stream.readUInt32() === 0 && this.stream.readUInt32() === 32)) {
        return this.emit('error', "Invalid 'desc' size, should be 32");
      }
      this.format = {};
      this.format.sampleRate = this.stream.readFloat64();
      this.format.formatID = this.stream.readString(4);
      flags = this.stream.readUInt32();
      if (this.format.formatID === 'lpcm') {
        this.format.floatingPoint = Boolean(flags & 1);
        this.format.littleEndian = Boolean(flags & 2);
      }
      this.format.bytesPerPacket = this.stream.readUInt32();
      this.format.framesPerPacket = this.stream.readUInt32();
      this.format.channelsPerFrame = this.stream.readUInt32();
      this.format.bitsPerChannel = this.stream.readUInt32();
      this.emit('format', this.format);
    }
    while (this.stream.available(1)) {
      if (!this.headerCache) {
        this.headerCache = {
          type: this.stream.readString(4),
          oversize: this.stream.readUInt32() !== 0,
          size: this.stream.readUInt32()
        };
        if (this.headerCache.oversize) {
          return this.emit('error', "Holy Shit, an oversized file, not supported in JS");
        }
      }
      switch (this.headerCache.type) {
        case 'kuki':
          if (this.stream.available(this.headerCache.size)) {
            if (this.format.formatID === 'aac ') {
              offset = this.stream.offset + this.headerCache.size;
              if (cookie = M4ADemuxer.readEsds(this.stream)) {
                this.emit('cookie', cookie);
              }
              this.stream.seek(offset);
            } else {
              buffer = this.stream.readBuffer(this.headerCache.size);
              this.emit('cookie', buffer);
            }
            this.headerCache = null;
          }
          break;
        case 'pakt':
          if (this.stream.available(this.headerCache.size)) {
            if (this.stream.readUInt32() !== 0) {
              return this.emit('error', 'Sizes greater than 32 bits are not supported.');
            }
            this.numPackets = this.stream.readUInt32();
            if (this.stream.readUInt32() !== 0) {
              return this.emit('error', 'Sizes greater than 32 bits are not supported.');
            }
            this.numFrames = this.stream.readUInt32();
            this.primingFrames = this.stream.readUInt32();
            this.remainderFrames = this.stream.readUInt32();
            this.emit('duration', this.numFrames / this.format.sampleRate * 1000 | 0);
            this.sentDuration = true;
            byteOffset = 0;
            sampleOffset = 0;
            for (i = _i = 0, _ref = this.numPackets; _i < _ref; i = _i += 1) {
              this.addSeekPoint(byteOffset, sampleOffset);
              byteOffset += this.format.bytesPerPacket || M4ADemuxer.readDescrLen(this.stream);
              sampleOffset += this.format.framesPerPacket || M4ADemuxer.readDescrLen(this.stream);
            }
            this.headerCache = null;
          }
          break;
        case 'info':
          entries = this.stream.readUInt32();
          metadata = {};
          for (i = _j = 0; 0 <= entries ? _j < entries : _j > entries; i = 0 <= entries ? ++_j : --_j) {
            key = this.stream.readString(null);
            value = this.stream.readString(null);
            metadata[key] = value;
          }
          this.emit('metadata', metadata);
          this.headerCache = null;
          break;
        case 'data':
          if (!this.sentFirstDataChunk) {
            this.stream.advance(4);
            this.headerCache.size -= 4;
            if (this.format.bytesPerPacket !== 0 && !this.sentDuration) {
              this.numFrames = this.headerCache.size / this.format.bytesPerPacket;
              this.emit('duration', this.numFrames / this.format.sampleRate * 1000 | 0);
            }
            this.sentFirstDataChunk = true;
          }
          buffer = this.stream.readSingleBuffer(this.headerCache.size);
          this.headerCache.size -= buffer.length;
          this.emit('data', buffer);
          if (this.headerCache.size <= 0) {
            this.headerCache = null;
          }
          break;
        default:
          if (this.stream.available(this.headerCache.size)) {
            this.stream.advance(this.headerCache.size);
            this.headerCache = null;
          }
      }
    }
  };

  return CAFDemuxer;

})(Demuxer);

},{"../demuxer":14,"./m4a":18}],18:[function(require,module,exports){
var Demuxer, M4ADemuxer,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Demuxer = require('../demuxer');

M4ADemuxer = (function(_super) {
  var BITS_PER_CHANNEL, TYPES, after, atom, atoms, bool, containers, diskTrack, genres, meta, string;

  __extends(M4ADemuxer, _super);

  function M4ADemuxer() {
    return M4ADemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(M4ADemuxer);

  TYPES = ['M4A ', 'M4P ', 'M4B ', 'M4V ', 'isom', 'mp42', 'qt  '];

  M4ADemuxer.probe = function(buffer) {
    var _ref;
    return buffer.peekString(4, 4) === 'ftyp' && (_ref = buffer.peekString(8, 4), __indexOf.call(TYPES, _ref) >= 0);
  };

  M4ADemuxer.prototype.init = function() {
    this.atoms = [];
    this.offsets = [];
    this.track = null;
    return this.tracks = [];
  };

  atoms = {};

  containers = {};

  atom = function(name, fn) {
    var c, container, _i, _len, _ref;
    c = [];
    _ref = name.split('.').slice(0, -1);
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      container = _ref[_i];
      c.push(container);
      containers[c.join('.')] = true;
    }
    if (atoms[name] == null) {
      atoms[name] = {};
    }
    return atoms[name].fn = fn;
  };

  after = function(name, fn) {
    if (atoms[name] == null) {
      atoms[name] = {};
    }
    return atoms[name].after = fn;
  };

  M4ADemuxer.prototype.readChunk = function() {
    var handler, path, type;
    this["break"] = false;
    while (this.stream.available(1) && !this["break"]) {
      if (!this.readHeaders) {
        if (!this.stream.available(8)) {
          return;
        }
        this.len = this.stream.readUInt32() - 8;
        this.type = this.stream.readString(4);
        if (this.len === 0) {
          continue;
        }
        this.atoms.push(this.type);
        this.offsets.push(this.stream.offset + this.len);
        this.readHeaders = true;
      }
      path = this.atoms.join('.');
      handler = atoms[path];
      if (handler != null ? handler.fn : void 0) {
        if (!(this.stream.available(this.len) || path === 'mdat')) {
          return;
        }
        handler.fn.call(this);
        if (path in containers) {
          this.readHeaders = false;
        }
      } else if (path in containers) {
        this.readHeaders = false;
      } else {
        if (!this.stream.available(this.len)) {
          return;
        }
        this.stream.advance(this.len);
      }
      while (this.stream.offset >= this.offsets[this.offsets.length - 1]) {
        handler = atoms[this.atoms.join('.')];
        if (handler != null ? handler.after : void 0) {
          handler.after.call(this);
        }
        type = this.atoms.pop();
        this.offsets.pop();
        this.readHeaders = false;
      }
    }
  };

  atom('ftyp', function() {
    var _ref;
    if (_ref = this.stream.readString(4), __indexOf.call(TYPES, _ref) < 0) {
      return this.emit('error', 'Not a valid M4A file.');
    }
    return this.stream.advance(this.len - 4);
  });

  atom('moov.trak', function() {
    this.track = {};
    return this.tracks.push(this.track);
  });

  atom('moov.trak.tkhd', function() {
    this.stream.advance(4);
    this.stream.advance(8);
    this.track.id = this.stream.readUInt32();
    return this.stream.advance(this.len - 16);
  });

  atom('moov.trak.mdia.hdlr', function() {
    this.stream.advance(4);
    this.stream.advance(4);
    this.track.type = this.stream.readString(4);
    this.stream.advance(12);
    return this.stream.advance(this.len - 24);
  });

  atom('moov.trak.mdia.mdhd', function() {
    this.stream.advance(4);
    this.stream.advance(8);
    this.track.timeScale = this.stream.readUInt32();
    this.track.duration = this.stream.readUInt32();
    return this.stream.advance(4);
  });

  BITS_PER_CHANNEL = {
    ulaw: 8,
    alaw: 8,
    in24: 24,
    in32: 32,
    fl32: 32,
    fl64: 64
  };

  atom('moov.trak.mdia.minf.stbl.stsd', function() {
    var format, numEntries, version, _ref, _ref1;
    this.stream.advance(4);
    numEntries = this.stream.readUInt32();
    if (this.track.type !== 'soun') {
      return this.stream.advance(this.len - 8);
    }
    if (numEntries !== 1) {
      return this.emit('error', "Only expecting one entry in sample description atom!");
    }
    this.stream.advance(4);
    format = this.track.format = {};
    format.formatID = this.stream.readString(4);
    this.stream.advance(6);
    this.stream.advance(2);
    version = this.stream.readUInt16();
    this.stream.advance(6);
    format.channelsPerFrame = this.stream.readUInt16();
    format.bitsPerChannel = this.stream.readUInt16();
    this.stream.advance(4);
    format.sampleRate = this.stream.readUInt16();
    this.stream.advance(2);
    if (version === 1) {
      format.framesPerPacket = this.stream.readUInt32();
      this.stream.advance(4);
      format.bytesPerFrame = this.stream.readUInt32();
      this.stream.advance(4);
    } else if (version !== 0) {
      this.emit('error', 'Unknown version in stsd atom');
    }
    if (BITS_PER_CHANNEL[format.formatID] != null) {
      format.bitsPerChannel = BITS_PER_CHANNEL[format.formatID];
    }
    format.floatingPoint = (_ref = format.formatID) === 'fl32' || _ref === 'fl64';
    format.littleEndian = format.formatID === 'sowt' && format.bitsPerChannel > 8;
    if ((_ref1 = format.formatID) === 'twos' || _ref1 === 'sowt' || _ref1 === 'in24' || _ref1 === 'in32' || _ref1 === 'fl32' || _ref1 === 'fl64' || _ref1 === 'raw ' || _ref1 === 'NONE') {
      return format.formatID = 'lpcm';
    }
  });

  atom('moov.trak.mdia.minf.stbl.stsd.alac', function() {
    this.stream.advance(4);
    return this.track.cookie = this.stream.readBuffer(this.len - 4);
  });

  atom('moov.trak.mdia.minf.stbl.stsd.esds', function() {
    var offset;
    offset = this.stream.offset + this.len;
    this.track.cookie = M4ADemuxer.readEsds(this.stream);
    return this.stream.seek(offset);
  });

  atom('moov.trak.mdia.minf.stbl.stsd.wave.enda', function() {
    return this.track.format.littleEndian = !!this.stream.readUInt16();
  });

  M4ADemuxer.readDescrLen = function(stream) {
    var c, count, len;
    len = 0;
    count = 4;
    while (count--) {
      c = stream.readUInt8();
      len = (len << 7) | (c & 0x7f);
      if (!(c & 0x80)) {
        break;
      }
    }
    return len;
  };

  M4ADemuxer.readEsds = function(stream) {
    var codec_id, flags, len, tag;
    stream.advance(4);
    tag = stream.readUInt8();
    len = M4ADemuxer.readDescrLen(stream);
    if (tag === 0x03) {
      stream.advance(2);
      flags = stream.readUInt8();
      if (flags & 0x80) {
        stream.advance(2);
      }
      if (flags & 0x40) {
        stream.advance(stream.readUInt8());
      }
      if (flags & 0x20) {
        stream.advance(2);
      }
    } else {
      stream.advance(2);
    }
    tag = stream.readUInt8();
    len = M4ADemuxer.readDescrLen(stream);
    if (tag === 0x04) {
      codec_id = stream.readUInt8();
      stream.advance(1);
      stream.advance(3);
      stream.advance(4);
      stream.advance(4);
      tag = stream.readUInt8();
      len = M4ADemuxer.readDescrLen(stream);
      if (tag === 0x05) {
        return stream.readBuffer(len);
      }
    }
    return null;
  };

  atom('moov.trak.mdia.minf.stbl.stts', function() {
    var entries, i, _i;
    this.stream.advance(4);
    entries = this.stream.readUInt32();
    this.track.stts = [];
    for (i = _i = 0; _i < entries; i = _i += 1) {
      this.track.stts[i] = {
        count: this.stream.readUInt32(),
        duration: this.stream.readUInt32()
      };
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.mdia.minf.stbl.stsc', function() {
    var entries, i, _i;
    this.stream.advance(4);
    entries = this.stream.readUInt32();
    this.track.stsc = [];
    for (i = _i = 0; _i < entries; i = _i += 1) {
      this.track.stsc[i] = {
        first: this.stream.readUInt32(),
        count: this.stream.readUInt32(),
        id: this.stream.readUInt32()
      };
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.mdia.minf.stbl.stsz', function() {
    var entries, i, _i;
    this.stream.advance(4);
    this.track.sampleSize = this.stream.readUInt32();
    entries = this.stream.readUInt32();
    if (this.track.sampleSize === 0 && entries > 0) {
      this.track.sampleSizes = [];
      for (i = _i = 0; _i < entries; i = _i += 1) {
        this.track.sampleSizes[i] = this.stream.readUInt32();
      }
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.mdia.minf.stbl.stco', function() {
    var entries, i, _i;
    this.stream.advance(4);
    entries = this.stream.readUInt32();
    this.track.chunkOffsets = [];
    for (i = _i = 0; _i < entries; i = _i += 1) {
      this.track.chunkOffsets[i] = this.stream.readUInt32();
    }
    return this.setupSeekPoints();
  });

  atom('moov.trak.tref.chap', function() {
    var entries, i, _i;
    entries = this.len >> 2;
    this.track.chapterTracks = [];
    for (i = _i = 0; _i < entries; i = _i += 1) {
      this.track.chapterTracks[i] = this.stream.readUInt32();
    }
  });

  M4ADemuxer.prototype.setupSeekPoints = function() {
    var i, j, offset, position, sampleIndex, size, stscIndex, sttsIndex, sttsSample, timestamp, _i, _j, _len, _ref, _ref1, _results;
    if (!((this.track.chunkOffsets != null) && (this.track.stsc != null) && (this.track.sampleSize != null) && (this.track.stts != null))) {
      return;
    }
    stscIndex = 0;
    sttsIndex = 0;
    sttsIndex = 0;
    sttsSample = 0;
    sampleIndex = 0;
    offset = 0;
    timestamp = 0;
    this.track.seekPoints = [];
    _ref = this.track.chunkOffsets;
    _results = [];
    for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
      position = _ref[i];
      for (j = _j = 0, _ref1 = this.track.stsc[stscIndex].count; _j < _ref1; j = _j += 1) {
        this.track.seekPoints.push({
          offset: offset,
          position: position,
          timestamp: timestamp
        });
        size = this.track.sampleSize || this.track.sampleSizes[sampleIndex++];
        offset += size;
        position += size;
        timestamp += this.track.stts[sttsIndex].duration;
        if (sttsIndex + 1 < this.track.stts.length && ++sttsSample === this.track.stts[sttsIndex].count) {
          sttsSample = 0;
          sttsIndex++;
        }
      }
      if (stscIndex + 1 < this.track.stsc.length && i + 1 === this.track.stsc[stscIndex + 1].first) {
        _results.push(stscIndex++);
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  after('moov', function() {
    var track, _i, _len, _ref;
    if (this.mdatOffset != null) {
      this.stream.seek(this.mdatOffset - 8);
    }
    _ref = this.tracks;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      track = _ref[_i];
      if (!(track.type === 'soun')) {
        continue;
      }
      this.track = track;
      break;
    }
    if (this.track.type !== 'soun') {
      this.track = null;
      return this.emit('error', 'No audio tracks in m4a file.');
    }
    this.emit('format', this.track.format);
    this.emit('duration', this.track.duration / this.track.timeScale * 1000 | 0);
    if (this.track.cookie) {
      this.emit('cookie', this.track.cookie);
    }
    return this.seekPoints = this.track.seekPoints;
  });

  atom('mdat', function() {
    var bytes, chunkSize, length, numSamples, offset, sample, size, _i;
    if (!this.startedData) {
      if (this.mdatOffset == null) {
        this.mdatOffset = this.stream.offset;
      }
      if (this.tracks.length === 0) {
        bytes = Math.min(this.stream.remainingBytes(), this.len);
        this.stream.advance(bytes);
        this.len -= bytes;
        return;
      }
      this.chunkIndex = 0;
      this.stscIndex = 0;
      this.sampleIndex = 0;
      this.tailOffset = 0;
      this.tailSamples = 0;
      this.startedData = true;
    }
    if (!this.readChapters) {
      this.readChapters = this.parseChapters();
      if (this["break"] = !this.readChapters) {
        return;
      }
      this.stream.seek(this.mdatOffset);
    }
    offset = this.track.chunkOffsets[this.chunkIndex] + this.tailOffset;
    length = 0;
    if (!this.stream.available(offset - this.stream.offset)) {
      this["break"] = true;
      return;
    }
    this.stream.seek(offset);
    while (this.chunkIndex < this.track.chunkOffsets.length) {
      numSamples = this.track.stsc[this.stscIndex].count - this.tailSamples;
      chunkSize = 0;
      for (sample = _i = 0; _i < numSamples; sample = _i += 1) {
        size = this.track.sampleSize || this.track.sampleSizes[this.sampleIndex];
        if (!this.stream.available(length + size)) {
          break;
        }
        length += size;
        chunkSize += size;
        this.sampleIndex++;
      }
      if (sample < numSamples) {
        this.tailOffset += chunkSize;
        this.tailSamples += sample;
        break;
      } else {
        this.chunkIndex++;
        this.tailOffset = 0;
        this.tailSamples = 0;
        if (this.stscIndex + 1 < this.track.stsc.length && this.chunkIndex + 1 === this.track.stsc[this.stscIndex + 1].first) {
          this.stscIndex++;
        }
        if (offset + length !== this.track.chunkOffsets[this.chunkIndex]) {
          break;
        }
      }
    }
    if (length > 0) {
      this.emit('data', this.stream.readBuffer(length));
      return this["break"] = this.chunkIndex === this.track.chunkOffsets.length;
    } else {
      return this["break"] = true;
    }
  });

  M4ADemuxer.prototype.parseChapters = function() {
    var bom, id, len, nextTimestamp, point, title, track, _i, _len, _ref, _ref1, _ref2, _ref3;
    if (!(((_ref = this.track.chapterTracks) != null ? _ref.length : void 0) > 0)) {
      return true;
    }
    id = this.track.chapterTracks[0];
    _ref1 = this.tracks;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      track = _ref1[_i];
      if (track.id === id) {
        break;
      }
    }
    if (track.id !== id) {
      this.emit('error', 'Chapter track does not exist.');
    }
    if (this.chapters == null) {
      this.chapters = [];
    }
    while (this.chapters.length < track.seekPoints.length) {
      point = track.seekPoints[this.chapters.length];
      if (!this.stream.available(point.position - this.stream.offset + 32)) {
        return false;
      }
      this.stream.seek(point.position);
      len = this.stream.readUInt16();
      title = null;
      if (!this.stream.available(len)) {
        return false;
      }
      if (len > 2) {
        bom = this.stream.peekUInt16();
        if (bom === 0xfeff || bom === 0xfffe) {
          title = this.stream.readString(len, 'utf16-bom');
        }
      }
      if (title == null) {
        title = this.stream.readString(len, 'utf8');
      }
      nextTimestamp = (_ref2 = (_ref3 = track.seekPoints[this.chapters.length + 1]) != null ? _ref3.timestamp : void 0) != null ? _ref2 : track.duration;
      this.chapters.push({
        title: title,
        timestamp: point.timestamp / track.timeScale * 1000 | 0,
        duration: (nextTimestamp - point.timestamp) / track.timeScale * 1000 | 0
      });
    }
    this.emit('chapters', this.chapters);
    return true;
  };

  atom('moov.udta.meta', function() {
    this.metadata = {};
    return this.stream.advance(4);
  });

  after('moov.udta.meta', function() {
    return this.emit('metadata', this.metadata);
  });

  meta = function(field, name, fn) {
    return atom("moov.udta.meta.ilst." + field + ".data", function() {
      this.stream.advance(8);
      this.len -= 8;
      return fn.call(this, name);
    });
  };

  string = function(field) {
    return this.metadata[field] = this.stream.readString(this.len, 'utf8');
  };

  meta('©alb', 'album', string);

  meta('©arg', 'arranger', string);

  meta('©art', 'artist', string);

  meta('©ART', 'artist', string);

  meta('aART', 'albumArtist', string);

  meta('catg', 'category', string);

  meta('©com', 'composer', string);

  meta('©cpy', 'copyright', string);

  meta('cprt', 'copyright', string);

  meta('©cmt', 'comments', string);

  meta('©day', 'releaseDate', string);

  meta('desc', 'description', string);

  meta('©gen', 'genre', string);

  meta('©grp', 'grouping', string);

  meta('©isr', 'ISRC', string);

  meta('keyw', 'keywords', string);

  meta('©lab', 'recordLabel', string);

  meta('ldes', 'longDescription', string);

  meta('©lyr', 'lyrics', string);

  meta('©nam', 'title', string);

  meta('©phg', 'recordingCopyright', string);

  meta('©prd', 'producer', string);

  meta('©prf', 'performers', string);

  meta('purd', 'purchaseDate', string);

  meta('purl', 'podcastURL', string);

  meta('©swf', 'songwriter', string);

  meta('©too', 'encoder', string);

  meta('©wrt', 'composer', string);

  meta('covr', 'coverArt', function(field) {
    return this.metadata[field] = this.stream.readBuffer(this.len);
  });

  genres = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise", "AlternRock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychadelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock", "Folk", "Folk/Rock", "National Folk", "Swing", "Fast Fusion", "Bebob", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde", "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock", "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour", "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony", "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club", "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul", "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A Capella", "Euro-House", "Dance Hall"];

  meta('gnre', 'genre', function(field) {
    return this.metadata[field] = genres[this.stream.readUInt16() - 1];
  });

  meta('tmpo', 'tempo', function(field) {
    return this.metadata[field] = this.stream.readUInt16();
  });

  meta('rtng', 'rating', function(field) {
    var rating;
    rating = this.stream.readUInt8();
    return this.metadata[field] = rating === 2 ? 'Clean' : rating !== 0 ? 'Explicit' : 'None';
  });

  diskTrack = function(field) {
    this.stream.advance(2);
    this.metadata[field] = this.stream.readUInt16() + ' of ' + this.stream.readUInt16();
    return this.stream.advance(this.len - 6);
  };

  meta('disk', 'diskNumber', diskTrack);

  meta('trkn', 'trackNumber', diskTrack);

  bool = function(field) {
    return this.metadata[field] = this.stream.readUInt8() === 1;
  };

  meta('cpil', 'compilation', bool);

  meta('pcst', 'podcast', bool);

  meta('pgap', 'gapless', bool);

  return M4ADemuxer;

})(Demuxer);

module.exports = M4ADemuxer;

},{"../demuxer":14}],19:[function(require,module,exports){
var Demuxer, WAVEDemuxer,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Demuxer = require('../demuxer');

WAVEDemuxer = (function(_super) {
  var formats;

  __extends(WAVEDemuxer, _super);

  function WAVEDemuxer() {
    return WAVEDemuxer.__super__.constructor.apply(this, arguments);
  }

  Demuxer.register(WAVEDemuxer);

  WAVEDemuxer.probe = function(buffer) {
    return buffer.peekString(0, 4) === 'RIFF' && buffer.peekString(8, 4) === 'WAVE';
  };

  formats = {
    0x0001: 'lpcm',
    0x0003: 'lpcm',
    0x0006: 'alaw',
    0x0007: 'ulaw'
  };

  WAVEDemuxer.prototype.readChunk = function() {
    var buffer, bytes, encoding;
    if (!this.readStart && this.stream.available(12)) {
      if (this.stream.readString(4) !== 'RIFF') {
        return this.emit('error', 'Invalid WAV file.');
      }
      this.fileSize = this.stream.readUInt32(true);
      this.readStart = true;
      if (this.stream.readString(4) !== 'WAVE') {
        return this.emit('error', 'Invalid WAV file.');
      }
    }
    while (this.stream.available(1)) {
      if (!this.readHeaders && this.stream.available(8)) {
        this.type = this.stream.readString(4);
        this.len = this.stream.readUInt32(true);
      }
      switch (this.type) {
        case 'fmt ':
          encoding = this.stream.readUInt16(true);
          if (!(encoding in formats)) {
            return this.emit('error', 'Unsupported format in WAV file.');
          }
          this.format = {
            formatID: formats[encoding],
            floatingPoint: encoding === 0x0003,
            littleEndian: formats[encoding] === 'lpcm',
            channelsPerFrame: this.stream.readUInt16(true),
            sampleRate: this.stream.readUInt32(true),
            framesPerPacket: 1
          };
          this.stream.advance(4);
          this.stream.advance(2);
          this.format.bitsPerChannel = this.stream.readUInt16(true);
          this.format.bytesPerPacket = (this.format.bitsPerChannel / 8) * this.format.channelsPerFrame;
          this.emit('format', this.format);
          this.stream.advance(this.len - 16);
          break;
        case 'data':
          if (!this.sentDuration) {
            bytes = this.format.bitsPerChannel / 8;
            this.emit('duration', this.len / bytes / this.format.channelsPerFrame / this.format.sampleRate * 1000 | 0);
            this.sentDuration = true;
          }
          buffer = this.stream.readSingleBuffer(this.len);
          this.len -= buffer.length;
          this.readHeaders = this.len > 0;
          this.emit('data', buffer);
          break;
        default:
          if (!this.stream.available(this.len)) {
            return;
          }
          this.stream.advance(this.len);
      }
      if (this.type !== 'data') {
        this.readHeaders = false;
      }
    }
  };

  return WAVEDemuxer;

})(Demuxer);

},{"../demuxer":14}],20:[function(require,module,exports){
var AudioDevice, EventEmitter,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('./core/events');

AudioDevice = (function(_super) {
  var devices;

  __extends(AudioDevice, _super);

  function AudioDevice(sampleRate, channels) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.updateTime = __bind(this.updateTime, this);
    this.playing = false;
    this.currentTime = 0;
    this._lastTime = 0;
  }

  AudioDevice.prototype.start = function() {
    if (this.playing) {
      return;
    }
    this.playing = true;
    if (this.device == null) {
      this.device = AudioDevice.create(this.sampleRate, this.channels);
    }
    if (!this.device) {
      throw new Error("No supported audio device found.");
    }
    this._lastTime = this.device.getDeviceTime();
    this._timer = setInterval(this.updateTime, 200);
    return this.device.on('refill', this.refill = (function(_this) {
      return function(buffer) {
        return _this.emit('refill', buffer);
      };
    })(this));
  };

  AudioDevice.prototype.stop = function() {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.device.off('refill', this.refill);
    return clearInterval(this._timer);
  };

  AudioDevice.prototype.destroy = function() {
    var _ref;
    this.stop();
    return (_ref = this.device) != null ? _ref.destroy() : void 0;
  };

  AudioDevice.prototype.seek = function(currentTime) {
    this.currentTime = currentTime;
    if (this.playing) {
      this._lastTime = this.device.getDeviceTime();
    }
    return this.emit('timeUpdate', this.currentTime);
  };

  AudioDevice.prototype.updateTime = function() {
    var time;
    time = this.device.getDeviceTime();
    this.currentTime += (time - this._lastTime) / this.device.sampleRate * 1000 | 0;
    this._lastTime = time;
    return this.emit('timeUpdate', this.currentTime);
  };

  devices = [];

  AudioDevice.register = function(device) {
    return devices.push(device);
  };

  AudioDevice.create = function(sampleRate, channels) {
    var device, _i, _len;
    for (_i = 0, _len = devices.length; _i < _len; _i++) {
      device = devices[_i];
      if (device.supported) {
        return new device(sampleRate, channels);
      }
    }
    return null;
  };

  return AudioDevice;

})(EventEmitter);

module.exports = AudioDevice;

},{"./core/events":8}],21:[function(require,module,exports){
var AVBuffer, AudioDevice, EventEmitter, MozillaAudioDevice,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('../core/events');

AudioDevice = require('../device');

AVBuffer = require('../core/buffer');

MozillaAudioDevice = (function(_super) {
  var createTimer, destroyTimer;

  __extends(MozillaAudioDevice, _super);

  AudioDevice.register(MozillaAudioDevice);

  MozillaAudioDevice.supported = (typeof Audio !== "undefined" && Audio !== null) && 'mozWriteAudio' in new Audio;

  function MozillaAudioDevice(sampleRate, channels) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.refill = __bind(this.refill, this);
    this.audio = new Audio;
    this.audio.mozSetup(this.channels, this.sampleRate);
    this.writePosition = 0;
    this.prebufferSize = this.sampleRate / 2;
    this.tail = null;
    this.timer = createTimer(this.refill, 100);
  }

  MozillaAudioDevice.prototype.refill = function() {
    var available, buffer, currentPosition, written;
    if (this.tail) {
      written = this.audio.mozWriteAudio(this.tail);
      this.writePosition += written;
      if (this.writePosition < this.tail.length) {
        this.tail = this.tail.subarray(written);
      } else {
        this.tail = null;
      }
    }
    currentPosition = this.audio.mozCurrentSampleOffset();
    available = currentPosition + this.prebufferSize - this.writePosition;
    if (available > 0) {
      buffer = new Float32Array(available);
      this.emit('refill', buffer);
      written = this.audio.mozWriteAudio(buffer);
      if (written < buffer.length) {
        this.tail = buffer.subarray(written);
      }
      this.writePosition += written;
    }
  };

  MozillaAudioDevice.prototype.destroy = function() {
    return destroyTimer(this.timer);
  };

  MozillaAudioDevice.prototype.getDeviceTime = function() {
    return this.audio.mozCurrentSampleOffset() / this.channels;
  };

  createTimer = function(fn, interval) {
    var url, worker;
    url = AVBuffer.makeBlobURL("setInterval(function() { postMessage('ping'); }, " + interval + ");");
    if (url == null) {
      return setInterval(fn, interval);
    }
    worker = new Worker(url);
    worker.onmessage = fn;
    worker.url = url;
    return worker;
  };

  destroyTimer = function(timer) {
    if (timer.terminate) {
      timer.terminate();
      return URL.revokeObjectURL(timer.url);
    } else {
      return clearInterval(timer);
    }
  };

  return MozillaAudioDevice;

})(EventEmitter);

},{"../core/buffer":6,"../core/events":8,"../device":20}],22:[function(require,module,exports){
//JavaScript Audio Resampler
//Copyright (C) 2011-2015 Grant Galitz
//Released to Public Domain
function Resampler(fromSampleRate, toSampleRate, channels, inputBufferLength) {
  this.fromSampleRate = +fromSampleRate;
  this.toSampleRate = +toSampleRate;
  this.channels = channels | 0;
  this.inputBufferLength = inputBufferLength;
  this.initialize();
}

Resampler.prototype.initialize = function () {
  //Perform some checks:
  if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
    if (this.fromSampleRate == this.toSampleRate) {
      //Setup a resampler bypass:
      this.resampler = this.bypassResampler;    //Resampler just returns what was passed through.
      this.ratioWeight = 1;
    } else {
      this.ratioWeight = this.fromSampleRate / this.toSampleRate;
      if (this.fromSampleRate < this.toSampleRate) {
        /*
          Use generic linear interpolation if upsampling,
          as linear interpolation produces a gradient that we want
          and works fine with two input sample points per output in this case.
        */
        this.compileLinearInterpolationFunction();
        this.lastWeight = 1;
      } else {
        /*
          Custom resampler I wrote that doesn't skip samples
          like standard linear interpolation in high downsampling.
          This is more accurate than linear interpolation on downsampling.
        */
        this.compileMultiTapFunction();
        this.tailExists = false;
        this.lastWeight = 0;
      }
      
      var outputBufferSize = (Math.ceil(this.inputBufferLength * this.toSampleRate / this.fromSampleRate / this.channels * 1.01) * this.channels) + this.channels;
      this.outputBuffer = new Float32Array(outputBufferSize);
      this.lastOutput = new Float32Array(this.channels);
    }
  } else {
    throw(new Error("Invalid settings specified for the resampler."));
  }
};

Resampler.prototype.compileLinearInterpolationFunction = function () {
  var toCompile = "var outputOffset = 0;\
    var bufferLength = buffer.length;\
    if (bufferLength > 0) {\
      var weight = this.lastWeight;\
      var firstWeight = 0;\
      var secondWeight = 0;\
      var sourceOffset = 0;\
      var outputOffset = 0;\
      var outputBuffer = this.outputBuffer;\
      for (; weight < 1; weight += " + this.ratioWeight + ") {\
        secondWeight = weight % 1;\
        firstWeight = 1 - secondWeight;";
        for (var channel = 0; channel < this.channels; ++channel) {
          toCompile += "outputBuffer[outputOffset++] = (this.lastOutput[" + channel + "] * firstWeight) + (buffer[" + channel + "] * secondWeight);";
        }
      toCompile += "}\
      weight -= 1;\
      for (bufferLength -= " + this.channels + ", sourceOffset = Math.floor(weight) * " + this.channels + "; sourceOffset < bufferLength;) {\
        secondWeight = weight % 1;\
        firstWeight = 1 - secondWeight;";
        for (var channel = 0; channel < this.channels; ++channel) {
          toCompile += "outputBuffer[outputOffset++] = (buffer[sourceOffset" + ((channel > 0) ? (" + " + channel) : "") + "] * firstWeight) + (buffer[sourceOffset + " + (this.channels + channel) + "] * secondWeight);";
        }
        toCompile += "weight += " + this.ratioWeight + ";\
        sourceOffset = Math.floor(weight) * " + this.channels + ";\
      }";
      for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += "this.lastOutput[" + channel + "] = buffer[sourceOffset++];";
      }
      toCompile += "this.lastWeight = weight % 1;\
    }\
    return this.outputBuffer;";
    
  this.resampler = Function("buffer", toCompile);
};

Resampler.prototype.compileMultiTapFunction = function () {
  var toCompile = "var outputOffset = 0;\
    var bufferLength = buffer.length;\
    if (bufferLength > 0) {\
      var weight = 0;";
      for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += "var output" + channel + " = 0;"
      }
      toCompile += "var actualPosition = 0;\
      var amountToNext = 0;\
      var alreadyProcessedTail = !this.tailExists;\
      this.tailExists = false;\
      var outputBuffer = this.outputBuffer;\
      var currentPosition = 0;\
      do {\
        if (alreadyProcessedTail) {\
          weight = " + this.ratioWeight + ";";
          for (channel = 0; channel < this.channels; ++channel) {
            toCompile += "output" + channel + " = 0;"
          }
        toCompile += "}\
        else {\
          weight = this.lastWeight;";
          for (channel = 0; channel < this.channels; ++channel) {
            toCompile += "output" + channel + " = this.lastOutput[" + channel + "];"
          }
          toCompile += "alreadyProcessedTail = true;\
        }\
        while (weight > 0 && actualPosition < bufferLength) {\
          amountToNext = 1 + actualPosition - currentPosition;\
          if (weight >= amountToNext) {";
            for (channel = 0; channel < this.channels; ++channel) {
              toCompile += "output" + channel + " += buffer[actualPosition++] * amountToNext;"
            }
            toCompile += "currentPosition = actualPosition;\
            weight -= amountToNext;\
          }\
          else {";
            for (channel = 0; channel < this.channels; ++channel) {
              toCompile += "output" + channel + " += buffer[actualPosition" + ((channel > 0) ? (" + " + channel) : "") + "] * weight;"
            }
            toCompile += "currentPosition += weight;\
            weight = 0;\
            break;\
          }\
        }\
        if (weight <= 0) {";
          for (channel = 0; channel < this.channels; ++channel) {
            toCompile += "outputBuffer[outputOffset++] = output" + channel + " / " + this.ratioWeight + ";"
          }
        toCompile += "}\
        else {\
          this.lastWeight = weight;";
          for (channel = 0; channel < this.channels; ++channel) {
            toCompile += "this.lastOutput[" + channel + "] = output" + channel + ";"
          }
          toCompile += "this.tailExists = true;\
          break;\
        }\
      } while (actualPosition < bufferLength);\
    }\
    return this.outputBuffer;";
  
  this.resampler = Function("buffer", toCompile);
};

Resampler.prototype.bypassResampler = function (inputBuffer) {
  return inputBuffer;
};

module.exports = Resampler;

},{}],23:[function(require,module,exports){
(function (global){
var AudioDevice, EventEmitter, Resampler, WebAudioDevice,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('../core/events');

AudioDevice = require('../device');

Resampler = require('./resampler');

WebAudioDevice = (function(_super) {
  var AudioContext, createProcessor, sharedContext;

  __extends(WebAudioDevice, _super);

  AudioDevice.register(WebAudioDevice);

  AudioContext = global.AudioContext || global.webkitAudioContext;

  WebAudioDevice.supported = AudioContext && (typeof AudioContext.prototype[createProcessor = 'createScriptProcessor'] === 'function' || typeof AudioContext.prototype[createProcessor = 'createJavaScriptNode'] === 'function');

  sharedContext = null;

  function WebAudioDevice(sampleRate, channels) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.refill = __bind(this.refill, this);
    this.context = sharedContext != null ? sharedContext : sharedContext = new AudioContext;
    this.deviceSampleRate = this.context.sampleRate;
    this.bufferSize = Math.ceil(4096 / (this.deviceSampleRate / this.sampleRate) * this.channels);
    this.bufferSize += this.bufferSize % this.channels;
    if (this.deviceSampleRate !== this.sampleRate) {
      this.resampler = new Resampler(this.sampleRate, this.deviceSampleRate, this.channels, this.bufferSize);
    }
    this.node = this.context[createProcessor](4096, this.channels, this.channels);
    this.node.onaudioprocess = this.refill;
    this.node.connect(this.context.destination);
  }

  WebAudioDevice.prototype.refill = function(event) {
    var channelCount, channels, data, i, n, outputBuffer, _i, _j, _k, _ref;
    outputBuffer = event.outputBuffer;
    channelCount = outputBuffer.numberOfChannels;
    channels = new Array(channelCount);
    for (i = _i = 0; _i < channelCount; i = _i += 1) {
      channels[i] = outputBuffer.getChannelData(i);
    }
    data = new Float32Array(this.bufferSize);
    this.emit('refill', data);
    if (this.resampler) {
      data = this.resampler.resampler(data);
    }
    for (i = _j = 0, _ref = outputBuffer.length; _j < _ref; i = _j += 1) {
      for (n = _k = 0; _k < channelCount; n = _k += 1) {
        channels[n][i] = data[i * channelCount + n];
      }
    }
  };

  WebAudioDevice.prototype.destroy = function() {
    return this.node.disconnect(0);
  };

  WebAudioDevice.prototype.getDeviceTime = function() {
    return this.context.currentTime * this.sampleRate;
  };

  return WebAudioDevice;

})(EventEmitter);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../core/events":8,"../device":20,"./resampler":22}],24:[function(require,module,exports){
var Filter;

Filter = (function() {
  function Filter(context, key) {
    if (context && key) {
      Object.defineProperty(this, 'value', {
        get: function() {
          return context[key];
        }
      });
    }
  }

  Filter.prototype.process = function(buffer) {};

  return Filter;

})();

module.exports = Filter;

},{}],25:[function(require,module,exports){
var BalanceFilter, Filter,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Filter = require('../filter');

BalanceFilter = (function(_super) {
  __extends(BalanceFilter, _super);

  function BalanceFilter() {
    return BalanceFilter.__super__.constructor.apply(this, arguments);
  }

  BalanceFilter.prototype.process = function(buffer) {
    var i, pan, _i, _ref;
    if (this.value === 0) {
      return;
    }
    pan = Math.max(-50, Math.min(50, this.value));
    for (i = _i = 0, _ref = buffer.length; _i < _ref; i = _i += 2) {
      buffer[i] *= Math.min(1, (50 - pan) / 50);
      buffer[i + 1] *= Math.min(1, (50 + pan) / 50);
    }
  };

  return BalanceFilter;

})(Filter);

module.exports = BalanceFilter;

},{"../filter":24}],26:[function(require,module,exports){
var Filter, VolumeFilter,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Filter = require('../filter');

VolumeFilter = (function(_super) {
  __extends(VolumeFilter, _super);

  function VolumeFilter() {
    return VolumeFilter.__super__.constructor.apply(this, arguments);
  }

  VolumeFilter.prototype.process = function(buffer) {
    var i, vol, _i, _ref;
    if (this.value >= 100) {
      return;
    }
    vol = Math.max(0, Math.min(100, this.value)) / 100;
    for (i = _i = 0, _ref = buffer.length; _i < _ref; i = _i += 1) {
      buffer[i] *= vol;
    }
  };

  return VolumeFilter;

})(Filter);

module.exports = VolumeFilter;

},{"../filter":24}],27:[function(require,module,exports){
var Asset, AudioDevice, BalanceFilter, EventEmitter, Player, Queue, VolumeFilter,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('./core/events');

Asset = require('./asset');

VolumeFilter = require('./filters/volume');

BalanceFilter = require('./filters/balance');

Queue = require('./queue');

AudioDevice = require('./device');

Player = (function(_super) {
  __extends(Player, _super);

  function Player(asset) {
    this.asset = asset;
    this.startPlaying = __bind(this.startPlaying, this);
    this.playing = false;
    this.buffered = 0;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 100;
    this.pan = 0;
    this.metadata = {};
    this.filters = [new VolumeFilter(this, 'volume'), new BalanceFilter(this, 'pan')];
    this.asset.on('buffer', (function(_this) {
      return function(buffered) {
        _this.buffered = buffered;
        return _this.emit('buffer', _this.buffered);
      };
    })(this));
    this.asset.on('decodeStart', (function(_this) {
      return function() {
        _this.queue = new Queue(_this.asset);
        return _this.queue.once('ready', _this.startPlaying);
      };
    })(this));
    this.asset.on('format', (function(_this) {
      return function(format) {
        _this.format = format;
        return _this.emit('format', _this.format);
      };
    })(this));
    this.asset.on('metadata', (function(_this) {
      return function(metadata) {
        _this.metadata = metadata;
        return _this.emit('metadata', _this.metadata);
      };
    })(this));
    this.asset.on('duration', (function(_this) {
      return function(duration) {
        _this.duration = duration;
        return _this.emit('duration', _this.duration);
      };
    })(this));
    this.asset.on('error', (function(_this) {
      return function(error) {
        return _this.emit('error', error);
      };
    })(this));
  }

  Player.fromURL = function(url, opts) {
    return new Player(Asset.fromURL(url, opts));
  };

  Player.fromFile = function(file) {
    return new Player(Asset.fromFile(file));
  };

  Player.fromBuffer = function(buffer) {
    return new Player(Asset.fromBuffer(buffer));
  };

  Player.prototype.preload = function() {
    if (!this.asset) {
      return;
    }
    this.startedPreloading = true;
    return this.asset.start(false);
  };

  Player.prototype.play = function() {
    var _ref;
    if (this.playing) {
      return;
    }
    if (!this.startedPreloading) {
      this.preload();
    }
    this.playing = true;
    return (_ref = this.device) != null ? _ref.start() : void 0;
  };

  Player.prototype.pause = function() {
    var _ref;
    if (!this.playing) {
      return;
    }
    this.playing = false;
    return (_ref = this.device) != null ? _ref.stop() : void 0;
  };

  Player.prototype.togglePlayback = function() {
    if (this.playing) {
      return this.pause();
    } else {
      return this.play();
    }
  };

  Player.prototype.stop = function() {
    var _ref;
    this.pause();
    this.asset.stop();
    return (_ref = this.device) != null ? _ref.destroy() : void 0;
  };

  Player.prototype.seek = function(timestamp) {
    var _ref;
    if ((_ref = this.device) != null) {
      _ref.stop();
    }
    this.queue.once('ready', (function(_this) {
      return function() {
        var _ref1, _ref2;
        if ((_ref1 = _this.device) != null) {
          _ref1.seek(_this.currentTime);
        }
        if (_this.playing) {
          return (_ref2 = _this.device) != null ? _ref2.start() : void 0;
        }
      };
    })(this));
    timestamp = (timestamp / 1000) * this.format.sampleRate;
    timestamp = this.asset.decoder.seek(timestamp);
    this.currentTime = timestamp / this.format.sampleRate * 1000 | 0;
    this.queue.reset();
    return this.currentTime;
  };

  Player.prototype.startPlaying = function() {
    var frame, frameOffset;
    frame = this.queue.read();
    frameOffset = 0;
    this.device = new AudioDevice(this.format.sampleRate, this.format.channelsPerFrame);
    this.device.on('timeUpdate', (function(_this) {
      return function(currentTime) {
        _this.currentTime = currentTime;
        return _this.emit('progress', _this.currentTime);
      };
    })(this));
    this.refill = (function(_this) {
      return function(buffer) {
        var bufferOffset, filter, i, max, _i, _j, _len, _ref;
        if (!_this.playing) {
          return;
        }
        if (!frame) {
          frame = _this.queue.read();
          frameOffset = 0;
        }
        bufferOffset = 0;
        while (frame && bufferOffset < buffer.length) {
          max = Math.min(frame.length - frameOffset, buffer.length - bufferOffset);
          for (i = _i = 0; _i < max; i = _i += 1) {
            buffer[bufferOffset++] = frame[frameOffset++];
          }
          if (frameOffset === frame.length) {
            frame = _this.queue.read();
            frameOffset = 0;
          }
        }
        _ref = _this.filters;
        for (_j = 0, _len = _ref.length; _j < _len; _j++) {
          filter = _ref[_j];
          filter.process(buffer);
        }
        if (!frame) {
          if (_this.queue.ended) {
            _this.currentTime = _this.duration;
            _this.emit('progress', _this.currentTime);
            _this.emit('end');
            _this.stop();
          } else {
            _this.device.stop();
          }
        }
      };
    })(this);
    this.device.on('refill', this.refill);
    if (this.playing) {
      this.device.start();
    }
    return this.emit('ready');
  };

  Player.prototype.destroy = function() {
    var _ref, _ref1;
    this.stop();
    if ((_ref = this.device) != null) {
      _ref.off();
    }
    if ((_ref1 = this.asset) != null) {
      _ref1.destroy();
    }
    return this.off();
  };

  return Player;

})(EventEmitter);

module.exports = Player;

},{"./asset":1,"./core/events":8,"./device":20,"./filters/balance":25,"./filters/volume":26,"./queue":28}],28:[function(require,module,exports){
var EventEmitter, Queue,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('./core/events');

Queue = (function(_super) {
  __extends(Queue, _super);

  function Queue(asset) {
    this.asset = asset;
    this.write = __bind(this.write, this);
    this.readyMark = 64;
    this.finished = false;
    this.buffering = true;
    this.ended = false;
    this.buffers = [];
    this.asset.on('data', this.write);
    this.asset.on('end', (function(_this) {
      return function() {
        return _this.ended = true;
      };
    })(this));
    this.asset.decodePacket();
  }

  Queue.prototype.write = function(buffer) {
    if (buffer) {
      this.buffers.push(buffer);
    }
    if (this.buffering) {
      if (this.buffers.length >= this.readyMark || this.ended) {
        this.buffering = false;
        return this.emit('ready');
      } else {
        return this.asset.decodePacket();
      }
    }
  };

  Queue.prototype.read = function() {
    if (this.buffers.length === 0) {
      return null;
    }
    this.asset.decodePacket();
    return this.buffers.shift();
  };

  Queue.prototype.reset = function() {
    this.buffers.length = 0;
    this.buffering = true;
    return this.asset.decodePacket();
  };

  return Queue;

})(EventEmitter);

module.exports = Queue;

},{"./core/events":8}],29:[function(require,module,exports){
var AVBuffer, EventEmitter, FileSource,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('../../core/events');

AVBuffer = require('../../core/buffer');

FileSource = (function(_super) {
  __extends(FileSource, _super);

  function FileSource(file) {
    this.file = file;
    if (typeof FileReader === "undefined" || FileReader === null) {
      return this.emit('error', 'This browser does not have FileReader support.');
    }
    this.offset = 0;
    this.length = this.file.size;
    this.chunkSize = 1 << 20;
    this.file[this.slice = 'slice'] || this.file[this.slice = 'webkitSlice'] || this.file[this.slice = 'mozSlice'];
  }

  FileSource.prototype.start = function() {
    if (this.reader) {
      if (!this.active) {
        return this.loop();
      }
    }
    this.reader = new FileReader;
    this.active = true;
    this.reader.onload = (function(_this) {
      return function(e) {
        var buf;
        buf = new AVBuffer(new Uint8Array(e.target.result));
        _this.offset += buf.length;
        _this.emit('data', buf);
        _this.active = false;
        if (_this.offset < _this.length) {
          return _this.loop();
        }
      };
    })(this);
    this.reader.onloadend = (function(_this) {
      return function() {
        if (_this.offset === _this.length) {
          _this.emit('end');
          return _this.reader = null;
        }
      };
    })(this);
    this.reader.onerror = (function(_this) {
      return function(e) {
        return _this.emit('error', e);
      };
    })(this);
    this.reader.onprogress = (function(_this) {
      return function(e) {
        return _this.emit('progress', (_this.offset + e.loaded) / _this.length * 100);
      };
    })(this);
    return this.loop();
  };

  FileSource.prototype.loop = function() {
    var blob, endPos;
    this.active = true;
    endPos = Math.min(this.offset + this.chunkSize, this.length);
    blob = this.file[this.slice](this.offset, endPos);
    return this.reader.readAsArrayBuffer(blob);
  };

  FileSource.prototype.pause = function() {
    var _ref;
    this.active = false;
    try {
      return (_ref = this.reader) != null ? _ref.abort() : void 0;
    } catch (_error) {}
  };

  FileSource.prototype.reset = function() {
    this.pause();
    return this.offset = 0;
  };

  return FileSource;

})(EventEmitter);

module.exports = FileSource;

},{"../../core/buffer":6,"../../core/events":8}],30:[function(require,module,exports){
var AVBuffer, EventEmitter, HTTPSource,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('../../core/events');

AVBuffer = require('../../core/buffer');

HTTPSource = (function(_super) {
  __extends(HTTPSource, _super);

  function HTTPSource(url, opts) {
    this.url = url;
    this.opts = opts != null ? opts : {};
    this.chunkSize = 1 << 20;
    this.inflight = false;
    if (this.opts.length) {
      this.length = this.opts.length;
    }
    this.reset();
  }

  HTTPSource.prototype.start = function() {
    if (this.length) {
      if (!this.inflight) {
        return this.loop();
      }
    }
    this.inflight = true;
    this.xhr = new XMLHttpRequest();
    this.xhr.onload = (function(_this) {
      return function(event) {
        _this.length = parseInt(_this.xhr.getResponseHeader("Content-Length"));
        _this.inflight = false;
        return _this.loop();
      };
    })(this);
    this.xhr.onerror = (function(_this) {
      return function(err) {
        _this.pause();
        return _this.emit('error', err);
      };
    })(this);
    this.xhr.onabort = (function(_this) {
      return function(event) {
        return _this.inflight = false;
      };
    })(this);
    this.xhr.open("HEAD", this.url, true);
    return this.xhr.send(null);
  };

  HTTPSource.prototype.loop = function() {
    var endPos;
    if (this.inflight || !this.length) {
      return this.emit('error', 'Something is wrong in HTTPSource.loop');
    }
    this.inflight = true;
    this.xhr = new XMLHttpRequest();
    this.xhr.onload = (function(_this) {
      return function(event) {
        var buf, buffer, i, txt, _i, _ref;
        if (_this.xhr.response) {
          buf = new Uint8Array(_this.xhr.response);
        } else {
          txt = _this.xhr.responseText;
          buf = new Uint8Array(txt.length);
          for (i = _i = 0, _ref = txt.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
            buf[i] = txt.charCodeAt(i) & 0xff;
          }
        }
        buffer = new AVBuffer(buf);
        _this.offset += buffer.length;
        _this.emit('data', buffer);
        if (_this.offset >= _this.length) {
          _this.emit('end');
        }
        _this.inflight = false;
        if (!(_this.offset >= _this.length)) {
          return _this.loop();
        }
      };
    })(this);
    this.xhr.onprogress = (function(_this) {
      return function(event) {
        return _this.emit('progress', (_this.offset + event.loaded) / _this.length * 100);
      };
    })(this);
    this.xhr.onerror = (function(_this) {
      return function(err) {
        _this.emit('error', err);
        return _this.pause();
      };
    })(this);
    this.xhr.onabort = (function(_this) {
      return function(event) {
        return _this.inflight = false;
      };
    })(this);
    this.xhr.open("GET", this.url, true);
    this.xhr.responseType = "arraybuffer";
    endPos = Math.min(this.offset + this.chunkSize, this.length - 1);
    this.xhr.setRequestHeader("If-None-Match", "webkit-no-cache");
    this.xhr.setRequestHeader("Range", "bytes=" + this.offset + "-" + endPos);
    this.xhr.overrideMimeType('text/plain; charset=x-user-defined');
    return this.xhr.send(null);
  };

  HTTPSource.prototype.pause = function() {
    var _ref;
    this.inflight = false;
    return (_ref = this.xhr) != null ? _ref.abort() : void 0;
  };

  HTTPSource.prototype.reset = function() {
    this.pause();
    return this.offset = 0;
  };

  return HTTPSource;

})(EventEmitter);

module.exports = HTTPSource;

},{"../../core/buffer":6,"../../core/events":8}],31:[function(require,module,exports){
(function (global){
var AVBuffer, BufferList, BufferSource, EventEmitter,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

EventEmitter = require('../core/events');

BufferList = require('../core/bufferlist');

AVBuffer = require('../core/buffer');

BufferSource = (function(_super) {
  var clearImmediate, setImmediate;

  __extends(BufferSource, _super);

  function BufferSource(input) {
    this.loop = __bind(this.loop, this);
    if (input instanceof BufferList) {
      this.list = input;
    } else {
      this.list = new BufferList;
      this.list.append(new AVBuffer(input));
    }
    this.paused = true;
  }

  setImmediate = global.setImmediate || function(fn) {
    return global.setTimeout(fn, 0);
  };

  clearImmediate = global.clearImmediate || function(timer) {
    return global.clearTimeout(timer);
  };

  BufferSource.prototype.start = function() {
    this.paused = false;
    return this._timer = setImmediate(this.loop);
  };

  BufferSource.prototype.loop = function() {
    this.emit('progress', (this.list.numBuffers - this.list.availableBuffers + 1) / this.list.numBuffers * 100 | 0);
    this.emit('data', this.list.first);
    if (this.list.advance()) {
      return setImmediate(this.loop);
    } else {
      return this.emit('end');
    }
  };

  BufferSource.prototype.pause = function() {
    clearImmediate(this._timer);
    return this.paused = true;
  };

  BufferSource.prototype.reset = function() {
    this.pause();
    return this.list.rewind();
  };

  return BufferSource;

})(EventEmitter);

module.exports = BufferSource;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../core/buffer":6,"../core/bufferlist":7,"../core/events":8}],32:[function(require,module,exports){
var key, val, _ref;

_ref = require('./src/aurora');
for (key in _ref) {
  val = _ref[key];
  exports[key] = val;
}

require('./src/devices/webaudio');

require('./src/devices/mozilla');

},{"./src/aurora":2,"./src/devices/mozilla":21,"./src/devices/webaudio":23}]},{},[32])(32)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9fYnJvd3Nlci1wYWNrQDYuMC4yQGJyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2Fzc2V0LmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2F1cm9yYS5jb2ZmZWUiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9hdXJvcmFfYmFzZS5jb2ZmZWUiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9jb3JlL2Jhc2UuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvY29yZS9iaXRzdHJlYW0uY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvY29yZS9idWZmZXIuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvY29yZS9idWZmZXJsaXN0LmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2NvcmUvZXZlbnRzLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2NvcmUvc3RyZWFtLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2NvcmUvdW5kZXJmbG93LmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2RlY29kZXIuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvZGVjb2RlcnMvbHBjbS5jb2ZmZWUiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9kZWNvZGVycy94bGF3LmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2RlbXV4ZXIuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvZGVtdXhlcnMvYWlmZi5jb2ZmZWUiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9kZW11eGVycy9hdS5jb2ZmZWUiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9kZW11eGVycy9jYWYuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvZGVtdXhlcnMvbTRhLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2RlbXV4ZXJzL3dhdmUuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvZGV2aWNlLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2RldmljZXMvbW96aWxsYS5jb2ZmZWUiLCJzcmMvZGV2aWNlcy9yZXNhbXBsZXIuanMiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9kZXZpY2VzL3dlYmF1ZGlvLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL2ZpbHRlci5jb2ZmZWUiLCIvVXNlcnMveGlhb21pbmZjL0Rvd25sb2Fkcy9hdXJvcmEuanMtbWFzdGVyL3NyYy9maWx0ZXJzL2JhbGFuY2UuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvZmlsdGVycy92b2x1bWUuY29mZmVlIiwiL1VzZXJzL3hpYW9taW5mYy9Eb3dubG9hZHMvYXVyb3JhLmpzLW1hc3Rlci9zcmMvcGxheWVyLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL3F1ZXVlLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL3NvdXJjZXMvYnJvd3Nlci9maWxlLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL3NvdXJjZXMvYnJvd3Nlci9odHRwLmNvZmZlZSIsIi9Vc2Vycy94aWFvbWluZmMvRG93bmxvYWRzL2F1cm9yYS5qcy1tYXN0ZXIvc3JjL3NvdXJjZXMvYnVmZmVyLmNvZmZlZSJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ1FBLElBQUEsMkVBQUE7RUFBQTs7aVNBQUE7O0FBQUEsWUFBQSxHQUFlLE9BQUEsQ0FBUSxlQUFSLENBQWYsQ0FBQTs7QUFBQSxVQUNBLEdBQWUsT0FBQSxDQUFRLHFCQUFSLENBRGYsQ0FBQTs7QUFBQSxVQUVBLEdBQWUsT0FBQSxDQUFRLHFCQUFSLENBRmYsQ0FBQTs7QUFBQSxZQUdBLEdBQWUsT0FBQSxDQUFRLGtCQUFSLENBSGYsQ0FBQTs7QUFBQSxPQUlBLEdBQWUsT0FBQSxDQUFRLFdBQVIsQ0FKZixDQUFBOztBQUFBLE9BS0EsR0FBZSxPQUFBLENBQVEsV0FBUixDQUxmLENBQUE7O0FBQUE7QUFRSSwwQkFBQSxDQUFBOztBQUFhLEVBQUEsZUFBRSxNQUFGLEdBQUE7QUFDVCxJQURVLElBQUMsQ0FBQSxTQUFBLE1BQ1gsQ0FBQTtBQUFBLDZDQUFBLENBQUE7QUFBQSxxREFBQSxDQUFBO0FBQUEseUNBQUEsQ0FBQTtBQUFBLElBQUEsSUFBQyxDQUFBLFFBQUQsR0FBWSxDQUFaLENBQUE7QUFBQSxJQUNBLElBQUMsQ0FBQSxRQUFELEdB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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDNUpBLElBQUEsb0RBQUE7RUFBQTs7aVNBQUE7O0FBQUEsWUFBQSxHQUFlLE9BQUEsQ0FBUSxnQkFBUixDQUFmLENBQUE7O0FBQUEsV0FDQSxHQUFjLE9BQUEsQ0FBUSxXQUFSLENBRGQsQ0FBQTs7QUFBQSxTQUVBLEdBQVksT0FBQSxDQUFRLGFBQVIsQ0FGWixDQUFBOztBQUFBO0FBS0ks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QixDQURBLENBQUE7QUFFQSxJQUFBLElBQUcsSUFBQyxDQUFBLElBQUksQ0FBQyxPQUFOLENBQUEsQ0FBSDthQUNJLFlBQUEsQ0FBYSxJQUFDLENBQUEsSUFBZCxFQURKO0tBQUEsTUFBQTthQUdJLElBQUMsQ0FBQSxJQUFELENBQU0sS0FBTixFQUhKO0tBSEU7RUFBQSxDQXJCTixDQUFBOztBQUFBLHlCQTZCQSxLQUFBLEdBQU8sU0FBQSxHQUFBO0FBQ0gsSUFBQSxjQUFBLENBQWUsSUFBQyxDQUFBLE1BQWhCLENBQUEsQ0FBQTtXQUNBLElBQUMsQ0FBQSxNQUFELEdBQVUsS0FGUDtFQUFBLENBN0JQLENBQUE7O0FBQUEseUJBaUNBLEtBQUEsR0FBTyxTQUFBLEdBQUE7QUFDSCxJQUFBLElBQUMsQ0FBQSxLQUFELENBQUEsQ0FBQSxDQUFBO1dBQ0EsSUFBQyxDQUFBLElBQUksQ0FBQyxNQUFOLENBQUEsRUFGRztFQUFBLENBakNQLENBQUE7O3NCQUFBOztHQUR1QixhQUozQixDQUFBOztBQUFBLE1BMENNLENBQUMsT0FBUCxHQUFpQixZQTFDakIsQ0FBQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIjXG4jIFRoZSBBc3NldCBjbGFzcyBpcyByZXNwb25zaWJsZSBmb3IgbWFuYWdpbmcgYWxsIGFzcGVjdHMgb2YgdGhlIFxuIyBkZWNvZGluZyBwaXBlbGluZSBmcm9tIHNvdXJjZSB0byBkZWNvZGVyLiAgWW91IGNhbiB1c2UgdGhlIEFzc2V0XG4jIGNsYXNzIHRvIGluc3BlY3QgaW5mb3JtYXRpb24gYWJvdXQgYW4gYXVkaW8gZmlsZSwgc3VjaCBhcyBpdHMgXG4jIGZvcm1hdCwgbWV0YWRhdGEsIGFuZCBkdXJhdGlvbiwgYXMgd2VsbCBhcyBhY3R1YWxseSBkZWNvZGUgdGhlXG4jIGZpbGUgdG8gbGluZWFyIFBDTSByYXcgYXVkaW8gZGF0YS5cbiNcblxuRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi9jb3JlL2V2ZW50cydcbkhUVFBTb3VyY2UgICA9IHJlcXVpcmUgJy4vc291cmNlcy9ub2RlL2h0dHAnXG5GaWxlU291cmNlICAgPSByZXF1aXJlICcuL3NvdXJjZXMvbm9kZS9maWxlJ1xuQnVmZmVyU291cmNlID0gcmVxdWlyZSAnLi9zb3VyY2VzL2J1ZmZlcidcbkRlbXV4ZXIgICAgICA9IHJlcXVpcmUgJy4vZGVtdXhlcidcbkRlY29kZXIgICAgICA9IHJlcXVpcmUgJy4vZGVjb2RlcidcblxuY2xhc3MgQXNzZXQgZXh0ZW5kcyBFdmVudEVtaXR0ZXJcbiAgICBjb25zdHJ1Y3RvcjogKEBzb3VyY2UpIC0+XG4gICAgICAgIEBidWZmZXJlZCA9IDBcbiAgICAgICAgQGR1cmF0aW9uID0gbnVsbFxuICAgICAgICBAZm9ybWF0ID0gbnVsbFxuICAgICAgICBAbWV0YWRhdGEgPSBudWxsXG4gICAgICAgIEBhY3RpdmUgPSBmYWxzZVxuICAgICAgICBAZGVtdXhlciA9IG51bGxcbiAgICAgICAgQGRlY29kZXIgPSBudWxsXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIEBzb3VyY2Uub25jZSAnZGF0YScsIEBwcm9iZVxuICAgICAgICBAc291cmNlLm9uICdlcnJvcicsIChlcnIpID0+XG4gICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJcbiAgICAgICAgICAgIEBzdG9wKClcbiAgICAgICAgICAgIFxuICAgICAgICBAc291cmNlLm9uICdwcm9ncmVzcycsIChAYnVmZmVyZWQpID0+XG4gICAgICAgICAgICBAZW1pdCAnYnVmZmVyJywgQGJ1ZmZlcmVkXG4gICAgICAgICAgICBcbiAgICBAZnJvbVVSTDogKHVybCwgb3B0cykgLT5cbiAgICAgICAgcmV0dXJuIG5ldyBBc3NldCBuZXcgSFRUUFNvdXJjZSh1cmwsIG9wdHMpXG5cbiAgICBAZnJvbUZpbGU6IChmaWxlKSAtPlxuICAgICAgICByZXR1cm4gbmV3IEFzc2V0IG5ldyBGaWxlU291cmNlKGZpbGUpXG4gICAgICAgIFxuICAgIEBmcm9tQnVmZmVyOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gbmV3IEFzc2V0IG5ldyBCdWZmZXJTb3VyY2UoYnVmZmVyKVxuICAgICAgICBcbiAgICBzdGFydDogKGRlY29kZSkgLT5cbiAgICAgICAgcmV0dXJuIGlmIEBhY3RpdmVcbiAgICAgICAgXG4gICAgICAgIEBzaG91bGREZWNvZGUgPSBkZWNvZGUgaWYgZGVjb2RlP1xuICAgICAgICBAc2hvdWxkRGVjb2RlID89IHRydWVcbiAgICAgICAgXG4gICAgICAgIEBhY3RpdmUgPSB0cnVlXG4gICAgICAgIEBzb3VyY2Uuc3RhcnQoKVxuICAgICAgICBcbiAgICAgICAgaWYgQGRlY29kZXIgYW5kIEBzaG91bGREZWNvZGVcbiAgICAgICAgICAgIEBfZGVjb2RlKClcbiAgICAgICAgXG4gICAgc3RvcDogLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAYWN0aXZlXG4gICAgICAgIFxuICAgICAgICBAYWN0aXZlID0gZmFsc2VcbiAgICAgICAgQHNvdXJjZS5wYXVzZSgpXG4gICAgICAgIFxuICAgIGdldDogKGV2ZW50LCBjYWxsYmFjaykgLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBldmVudCBpbiBbJ2Zvcm1hdCcsICdkdXJhdGlvbicsICdtZXRhZGF0YSddXG4gICAgICAgIFxuICAgICAgICBpZiB0aGlzW2V2ZW50XT9cbiAgICAgICAgICAgIGNhbGxiYWNrKHRoaXNbZXZlbnRdKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAb25jZSBldmVudCwgKHZhbHVlKSA9PlxuICAgICAgICAgICAgICAgIEBzdG9wKClcbiAgICAgICAgICAgICAgICBjYWxsYmFjayh2YWx1ZSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgQHN0YXJ0KClcbiAgICAgICAgICAgIFxuICAgIGRlY29kZVBhY2tldDogLT5cbiAgICAgICAgQGRlY29kZXIuZGVjb2RlKClcbiAgICAgICAgXG4gICAgZGVjb2RlVG9CdWZmZXI6IChjYWxsYmFjaykgLT5cbiAgICAgICAgbGVuZ3RoID0gMFxuICAgICAgICBjaHVua3MgPSBbXVxuICAgICAgICBAb24gJ2RhdGEnLCBkYXRhSGFuZGxlciA9IChjaHVuaykgLT5cbiAgICAgICAgICAgIGxlbmd0aCArPSBjaHVuay5sZW5ndGhcbiAgICAgICAgICAgIGNodW5rcy5wdXNoIGNodW5rXG4gICAgICAgICAgICBcbiAgICAgICAgQG9uY2UgJ2VuZCcsIC0+XG4gICAgICAgICAgICBidWYgPSBuZXcgRmxvYXQzMkFycmF5KGxlbmd0aClcbiAgICAgICAgICAgIG9mZnNldCA9IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIGNodW5rIGluIGNodW5rc1xuICAgICAgICAgICAgICAgIGJ1Zi5zZXQoY2h1bmssIG9mZnNldClcbiAgICAgICAgICAgICAgICBvZmZzZXQgKz0gY2h1bmsubGVuZ3RoXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBAb2ZmICdkYXRhJywgZGF0YUhhbmRsZXJcbiAgICAgICAgICAgIGNhbGxiYWNrKGJ1ZilcbiAgICAgICAgICAgIFxuICAgICAgICBAc3RhcnQoKVxuICAgIFxuICAgIHByb2JlOiAoY2h1bmspID0+XG4gICAgICAgIHJldHVybiB1bmxlc3MgQGFjdGl2ZVxuICAgICAgICBcbiAgICAgICAgZGVtdXhlciA9IERlbXV4ZXIuZmluZChjaHVuaylcbiAgICAgICAgaWYgbm90IGRlbXV4ZXJcbiAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnQSBkZW11eGVyIGZvciB0aGlzIGNvbnRhaW5lciB3YXMgbm90IGZvdW5kLidcbiAgICAgICAgICAgIFxuICAgICAgICBAZGVtdXhlciA9IG5ldyBkZW11eGVyKEBzb3VyY2UsIGNodW5rKVxuICAgICAgICBAZGVtdXhlci5vbiAnZm9ybWF0JywgQGZpbmREZWNvZGVyXG4gICAgICAgIFxuICAgICAgICBAZGVtdXhlci5vbiAnZHVyYXRpb24nLCAoQGR1cmF0aW9uKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2R1cmF0aW9uJywgQGR1cmF0aW9uXG4gICAgICAgICAgICBcbiAgICAgICAgQGRlbXV4ZXIub24gJ21ldGFkYXRhJywgKEBtZXRhZGF0YSkgPT5cbiAgICAgICAgICAgIEBlbWl0ICdtZXRhZGF0YScsIEBtZXRhZGF0YVxuICAgICAgICAgICAgXG4gICAgICAgIEBkZW11eGVyLm9uICdlcnJvcicsIChlcnIpID0+XG4gICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJcbiAgICAgICAgICAgIEBzdG9wKClcblxuICAgIGZpbmREZWNvZGVyOiAoQGZvcm1hdCkgPT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAYWN0aXZlXG4gICAgICAgIFxuICAgICAgICBAZW1pdCAnZm9ybWF0JywgQGZvcm1hdFxuICAgICAgICBcbiAgICAgICAgZGVjb2RlciA9IERlY29kZXIuZmluZChAZm9ybWF0LmZvcm1hdElEKVxuICAgICAgICBpZiBub3QgZGVjb2RlclxuICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsIFwiQSBkZWNvZGVyIGZvciAje0Bmb3JtYXQuZm9ybWF0SUR9IHdhcyBub3QgZm91bmQuXCJcblxuICAgICAgICBAZGVjb2RlciA9IG5ldyBkZWNvZGVyKEBkZW11eGVyLCBAZm9ybWF0KVxuICAgICAgICBcbiAgICAgICAgaWYgQGZvcm1hdC5mbG9hdGluZ1BvaW50XG4gICAgICAgICAgICBAZGVjb2Rlci5vbiAnZGF0YScsIChidWZmZXIpID0+XG4gICAgICAgICAgICAgICAgQGVtaXQgJ2RhdGEnLCBidWZmZXJcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGl2ID0gTWF0aC5wb3coMiwgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAtIDEpXG4gICAgICAgICAgICBAZGVjb2Rlci5vbiAnZGF0YScsIChidWZmZXIpID0+XG4gICAgICAgICAgICAgICAgYnVmID0gbmV3IEZsb2F0MzJBcnJheShidWZmZXIubGVuZ3RoKVxuICAgICAgICAgICAgICAgIGZvciBzYW1wbGUsIGkgaW4gYnVmZmVyXG4gICAgICAgICAgICAgICAgICAgIGJ1ZltpXSA9IHNhbXBsZSAvIGRpdlxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBAZW1pdCAnZGF0YScsIGJ1ZlxuICAgICAgICAgICAgXG4gICAgICAgIEBkZWNvZGVyLm9uICdlcnJvcicsIChlcnIpID0+XG4gICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJcbiAgICAgICAgICAgIEBzdG9wKClcbiAgICAgICAgICAgIFxuICAgICAgICBAZGVjb2Rlci5vbiAnZW5kJywgPT5cbiAgICAgICAgICAgIEBlbWl0ICdlbmQnXG4gICAgICAgICAgICBcbiAgICAgICAgQGVtaXQgJ2RlY29kZVN0YXJ0J1xuICAgICAgICBAX2RlY29kZSgpIGlmIEBzaG91bGREZWNvZGVcbiAgICAgICAgXG4gICAgX2RlY29kZTogPT5cbiAgICAgICAgY29udGludWUgd2hpbGUgQGRlY29kZXIuZGVjb2RlKCkgYW5kIEBhY3RpdmVcbiAgICAgICAgQGRlY29kZXIub25jZSAnZGF0YScsIEBfZGVjb2RlIGlmIEBhY3RpdmVcbiAgICAgICAgXG4gICAgZGVzdHJveTogLT5cbiAgICAgICAgQHN0b3AoKVxuICAgICAgICBAZGVtdXhlcj8ub2ZmKClcbiAgICAgICAgQGRlY29kZXI/Lm9mZigpXG4gICAgICAgIEBzb3VyY2U/Lm9mZigpXG4gICAgICAgIEBvZmYoKVxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gQXNzZXRcbiIsImZvciBrZXksIHZhbCBvZiByZXF1aXJlICcuL2F1cm9yYV9iYXNlJ1xuICAgIGV4cG9ydHNba2V5XSA9IHZhbFxuXG5yZXF1aXJlICcuL2RlbXV4ZXJzL2NhZidcbnJlcXVpcmUgJy4vZGVtdXhlcnMvbTRhJ1xucmVxdWlyZSAnLi9kZW11eGVycy9haWZmJ1xucmVxdWlyZSAnLi9kZW11eGVycy93YXZlJ1xucmVxdWlyZSAnLi9kZW11eGVycy9hdSdcblxucmVxdWlyZSAnLi9kZWNvZGVycy9scGNtJ1xucmVxdWlyZSAnLi9kZWNvZGVycy94bGF3JyIsImV4cG9ydHMuQmFzZSA9IHJlcXVpcmUgJy4vY29yZS9iYXNlJ1xuZXhwb3J0cy5CdWZmZXIgPSByZXF1aXJlICcuL2NvcmUvYnVmZmVyJ1xuZXhwb3J0cy5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi9jb3JlL2J1ZmZlcmxpc3QnXG5leHBvcnRzLlN0cmVhbSA9IHJlcXVpcmUgJy4vY29yZS9zdHJlYW0nXG5leHBvcnRzLkJpdHN0cmVhbSA9IHJlcXVpcmUgJy4vY29yZS9iaXRzdHJlYW0nXG5leHBvcnRzLkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5leHBvcnRzLlVuZGVyZmxvd0Vycm9yID0gcmVxdWlyZSAnLi9jb3JlL3VuZGVyZmxvdydcblxuIyBicm93c2VyaWZ5IHdpbGwgcmVwbGFjZSB0aGVzZSB3aXRoIHRoZSBicm93c2VyIHZlcnNpb25zXG5leHBvcnRzLkhUVFBTb3VyY2UgPSByZXF1aXJlICcuL3NvdXJjZXMvbm9kZS9odHRwJ1xuZXhwb3J0cy5GaWxlU291cmNlID0gcmVxdWlyZSAnLi9zb3VyY2VzL25vZGUvZmlsZSdcbmV4cG9ydHMuQnVmZmVyU291cmNlID0gcmVxdWlyZSAnLi9zb3VyY2VzL2J1ZmZlcidcblxuZXhwb3J0cy5EZW11eGVyID0gcmVxdWlyZSAnLi9kZW11eGVyJ1xuZXhwb3J0cy5EZWNvZGVyID0gcmVxdWlyZSAnLi9kZWNvZGVyJ1xuZXhwb3J0cy5BdWRpb0RldmljZSA9IHJlcXVpcmUgJy4vZGV2aWNlJ1xuZXhwb3J0cy5Bc3NldCA9IHJlcXVpcmUgJy4vYXNzZXQnXG5leHBvcnRzLlBsYXllciA9IHJlcXVpcmUgJy4vcGxheWVyJ1xuXG5leHBvcnRzLkZpbHRlciA9IHJlcXVpcmUgJy4vZmlsdGVyJ1xuZXhwb3J0cy5Wb2x1bWVGaWx0ZXIgPSByZXF1aXJlICcuL2ZpbHRlcnMvdm9sdW1lJ1xuZXhwb3J0cy5CYWxhbmNlRmlsdGVyID0gcmVxdWlyZSAnLi9maWx0ZXJzL2JhbGFuY2UnXG4iLCIjXG4jIFRoZSBCYXNlIGNsYXNzIGRlZmluZXMgYW4gZXh0ZW5kIG1ldGhvZCBzbyB0aGF0XG4jIENvZmZlZVNjcmlwdCBjbGFzc2VzIGNhbiBiZSBleHRlbmRlZCBlYXNpbHkgYnkgXG4jIHBsYWluIEphdmFTY3JpcHQuIEJhc2VkIG9uIGh0dHA6Ly9lam9obi5vcmcvYmxvZy9zaW1wbGUtamF2YXNjcmlwdC1pbmhlcml0YW5jZS8uXG4jXG5cbmNsYXNzIEJhc2VcbiAgICBmblRlc3QgPSAvXFxiX3N1cGVyXFxiL1xuICAgIFxuICAgIEBleHRlbmQ6IChwcm9wKSAtPlxuICAgICAgICBjbGFzcyBDbGFzcyBleHRlbmRzIHRoaXNcbiAgICAgICAgICAgIFxuICAgICAgICBpZiB0eXBlb2YgcHJvcCBpcyAnZnVuY3Rpb24nXG4gICAgICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMgQ2xhc3MucHJvdG90eXBlXG4gICAgICAgICAgICBwcm9wLmNhbGwoQ2xhc3MsIENsYXNzKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBwcm9wID0ge31cbiAgICAgICAgICAgIGZvciBrZXksIGZuIG9mIENsYXNzLnByb3RvdHlwZSB3aGVuIGtleSBub3QgaW4ga2V5c1xuICAgICAgICAgICAgICAgIHByb3Bba2V5XSA9IGZuXG4gICAgICAgIFxuICAgICAgICBfc3VwZXIgPSBDbGFzcy5fX3N1cGVyX19cbiAgICAgICAgXG4gICAgICAgIGZvciBrZXksIGZuIG9mIHByb3BcbiAgICAgICAgICAgICMgdGVzdCB3aGV0aGVyIHRoZSBtZXRob2QgYWN0dWFsbHkgdXNlcyBfc3VwZXIoKSBhbmQgd3JhcCBpdCBpZiBzb1xuICAgICAgICAgICAgaWYgdHlwZW9mIGZuIGlzICdmdW5jdGlvbicgYW5kIGZuVGVzdC50ZXN0KGZuKVxuICAgICAgICAgICAgICAgIGRvIChrZXksIGZuKSAtPlxuICAgICAgICAgICAgICAgICAgICBDbGFzczo6W2tleV0gPSAtPlxuICAgICAgICAgICAgICAgICAgICAgICAgdG1wID0gdGhpcy5fc3VwZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3N1cGVyID0gX3N1cGVyW2tleV1cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0ID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc3VwZXIgPSB0bXBcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJldFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgQ2xhc3M6OltrZXldID0gZm5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIENsYXNzXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBCYXNlXG4iLCJjbGFzcyBCaXRzdHJlYW1cbiAgICBjb25zdHJ1Y3RvcjogKEBzdHJlYW0pIC0+XG4gICAgICAgIEBiaXRQb3NpdGlvbiA9IDBcblxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJlc3VsdCA9IG5ldyBCaXRzdHJlYW0gQHN0cmVhbS5jb3B5KClcbiAgICAgICAgcmVzdWx0LmJpdFBvc2l0aW9uID0gQGJpdFBvc2l0aW9uXG4gICAgICAgIHJldHVybiByZXN1bHRcblxuICAgIG9mZnNldDogLT4gIyBTaG91bGQgYmUgYSBwcm9wZXJ0eVxuICAgICAgICByZXR1cm4gOCAqIEBzdHJlYW0ub2Zmc2V0ICsgQGJpdFBvc2l0aW9uXG5cbiAgICBhdmFpbGFibGU6IChiaXRzKSAtPlxuICAgICAgICByZXR1cm4gQHN0cmVhbS5hdmFpbGFibGUoKGJpdHMgKyA4IC0gQGJpdFBvc2l0aW9uKSAvIDgpXG5cbiAgICBhZHZhbmNlOiAoYml0cykgLT5cbiAgICAgICAgcG9zID0gQGJpdFBvc2l0aW9uICsgYml0c1xuICAgICAgICBAc3RyZWFtLmFkdmFuY2UocG9zID4+IDMpXG4gICAgICAgIEBiaXRQb3NpdGlvbiA9IHBvcyAmIDdcbiAgICAgICAgXG4gICAgcmV3aW5kOiAoYml0cykgLT5cbiAgICAgICAgcG9zID0gQGJpdFBvc2l0aW9uIC0gYml0c1xuICAgICAgICBAc3RyZWFtLnJld2luZChNYXRoLmFicyhwb3MgPj4gMykpXG4gICAgICAgIEBiaXRQb3NpdGlvbiA9IHBvcyAmIDdcbiAgICAgICAgXG4gICAgc2VlazogKG9mZnNldCkgLT5cbiAgICAgICAgY3VyT2Zmc2V0ID0gQG9mZnNldCgpXG4gICAgICAgIFxuICAgICAgICBpZiBvZmZzZXQgPiBjdXJPZmZzZXRcbiAgICAgICAgICAgIEBhZHZhbmNlIG9mZnNldCAtIGN1ck9mZnNldCBcbiAgICAgICAgICAgIFxuICAgICAgICBlbHNlIGlmIG9mZnNldCA8IGN1ck9mZnNldCBcbiAgICAgICAgICAgIEByZXdpbmQgY3VyT2Zmc2V0IC0gb2Zmc2V0XG5cbiAgICBhbGlnbjogLT5cbiAgICAgICAgdW5sZXNzIEBiaXRQb3NpdGlvbiBpcyAwXG4gICAgICAgICAgICBAYml0UG9zaXRpb24gPSAwXG4gICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMSlcbiAgICAgICAgXG4gICAgcmVhZDogKGJpdHMsIHNpZ25lZCkgLT5cbiAgICAgICAgcmV0dXJuIDAgaWYgYml0cyBpcyAwXG4gICAgICAgIFxuICAgICAgICBtQml0cyA9IGJpdHMgKyBAYml0UG9zaXRpb25cbiAgICAgICAgaWYgbUJpdHMgPD0gOFxuICAgICAgICAgICAgYSA9ICgoQHN0cmVhbS5wZWVrVUludDgoKSA8PCBAYml0UG9zaXRpb24pICYgMHhmZikgPj4+ICg4IC0gYml0cylcblxuICAgICAgICBlbHNlIGlmIG1CaXRzIDw9IDE2XG4gICAgICAgICAgICBhID0gKChAc3RyZWFtLnBlZWtVSW50MTYoKSA8PCBAYml0UG9zaXRpb24pICYgMHhmZmZmKSA+Pj4gKDE2IC0gYml0cylcblxuICAgICAgICBlbHNlIGlmIG1CaXRzIDw9IDI0XG4gICAgICAgICAgICBhID0gKChAc3RyZWFtLnBlZWtVSW50MjQoKSA8PCBAYml0UG9zaXRpb24pICYgMHhmZmZmZmYpID4+PiAoMjQgLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gMzJcbiAgICAgICAgICAgIGEgPSAoQHN0cmVhbS5wZWVrVUludDMyKCkgPDwgQGJpdFBvc2l0aW9uKSA+Pj4gKDMyIC0gYml0cylcblxuICAgICAgICBlbHNlIGlmIG1CaXRzIDw9IDQwXG4gICAgICAgICAgICBhMCA9IEBzdHJlYW0ucGVla1VJbnQ4KDApICogMHgwMTAwMDAwMDAwICMgc2FtZSBhcyBhIDw8IDMyXG4gICAgICAgICAgICBhMSA9IEBzdHJlYW0ucGVla1VJbnQ4KDEpIDw8IDI0ID4+PiAwXG4gICAgICAgICAgICBhMiA9IEBzdHJlYW0ucGVla1VJbnQ4KDIpIDw8IDE2XG4gICAgICAgICAgICBhMyA9IEBzdHJlYW0ucGVla1VJbnQ4KDMpIDw8IDhcbiAgICAgICAgICAgIGE0ID0gQHN0cmVhbS5wZWVrVUludDgoNClcblxuICAgICAgICAgICAgYSA9IGEwICsgYTEgKyBhMiArIGEzICsgYTRcbiAgICAgICAgICAgIGEgJT0gTWF0aC5wb3coMiwgNDAgLSBAYml0UG9zaXRpb24pICAgICAgICAgICAgICAgICAgICAgICAgIyAoYSA8PCBiaXRQb3NpdGlvbikgJiAweGZmZmZmZmZmZmZcbiAgICAgICAgICAgIGEgPSBNYXRoLmZsb29yKGEgLyBNYXRoLnBvdygyLCA0MCAtIEBiaXRQb3NpdGlvbiAtIGJpdHMpKSAgIyBhID4+PiAoNDAgLSBiaXRzKVxuXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciBcIlRvbyBtYW55IGJpdHMhXCJcbiAgICAgICAgICAgIFxuICAgICAgICBpZiBzaWduZWRcbiAgICAgICAgICAgICMgaWYgdGhlIHNpZ24gYml0IGlzIHR1cm5lZCBvbiwgZmxpcCB0aGUgYml0cyBhbmQgXG4gICAgICAgICAgICAjIGFkZCBvbmUgdG8gY29udmVydCB0byBhIG5lZ2F0aXZlIHZhbHVlXG4gICAgICAgICAgICBpZiBtQml0cyA8IDMyXG4gICAgICAgICAgICAgICAgaWYgYSA+Pj4gKGJpdHMgLSAxKVxuICAgICAgICAgICAgICAgICAgICBhID0gKCgxIDw8IGJpdHMgPj4+IDApIC0gYSkgKiAtMVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGlmIGEgLyBNYXRoLnBvdygyLCBiaXRzIC0gMSkgfCAwXG4gICAgICAgICAgICAgICAgICAgIGEgPSAoTWF0aC5wb3coMiwgYml0cykgLSBhKSAqIC0xXG5cbiAgICAgICAgQGFkdmFuY2UgYml0c1xuICAgICAgICByZXR1cm4gYVxuICAgICAgICBcbiAgICBwZWVrOiAoYml0cywgc2lnbmVkKSAtPlxuICAgICAgICByZXR1cm4gMCBpZiBiaXRzIGlzIDBcbiAgICAgICAgXG4gICAgICAgIG1CaXRzID0gYml0cyArIEBiaXRQb3NpdGlvblxuICAgICAgICBpZiBtQml0cyA8PSA4XG4gICAgICAgICAgICBhID0gKChAc3RyZWFtLnBlZWtVSW50OCgpIDw8IEBiaXRQb3NpdGlvbikgJiAweGZmKSA+Pj4gKDggLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gMTZcbiAgICAgICAgICAgIGEgPSAoKEBzdHJlYW0ucGVla1VJbnQxNigpIDw8IEBiaXRQb3NpdGlvbikgJiAweGZmZmYpID4+PiAoMTYgLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gMjRcbiAgICAgICAgICAgIGEgPSAoKEBzdHJlYW0ucGVla1VJbnQyNCgpIDw8IEBiaXRQb3NpdGlvbikgJiAweGZmZmZmZikgPj4+ICgyNCAtIGJpdHMpXG5cbiAgICAgICAgZWxzZSBpZiBtQml0cyA8PSAzMlxuICAgICAgICAgICAgYSA9IChAc3RyZWFtLnBlZWtVSW50MzIoKSA8PCBAYml0UG9zaXRpb24pID4+PiAoMzIgLSBiaXRzKVxuXG4gICAgICAgIGVsc2UgaWYgbUJpdHMgPD0gNDBcbiAgICAgICAgICAgIGEwID0gQHN0cmVhbS5wZWVrVUludDgoMCkgKiAweDAxMDAwMDAwMDAgIyBzYW1lIGFzIGEgPDwgMzJcbiAgICAgICAgICAgIGExID0gQHN0cmVhbS5wZWVrVUludDgoMSkgPDwgMjQgPj4+IDBcbiAgICAgICAgICAgIGEyID0gQHN0cmVhbS5wZWVrVUludDgoMikgPDwgMTZcbiAgICAgICAgICAgIGEzID0gQHN0cmVhbS5wZWVrVUludDgoMykgPDwgOFxuICAgICAgICAgICAgYTQgPSBAc3RyZWFtLnBlZWtVSW50OCg0KVxuXG4gICAgICAgICAgICBhID0gYTAgKyBhMSArIGEyICsgYTMgKyBhNFxuICAgICAgICAgICAgYSAlPSBNYXRoLnBvdygyLCA0MCAtIEBiaXRQb3NpdGlvbikgICAgICAgICAgICAgICAgICAgICAgICAjIChhIDw8IGJpdFBvc2l0aW9uKSAmIDB4ZmZmZmZmZmZmZlxuICAgICAgICAgICAgYSA9IE1hdGguZmxvb3IoYSAvIE1hdGgucG93KDIsIDQwIC0gQGJpdFBvc2l0aW9uIC0gYml0cykpICAjIGEgPj4+ICg0MCAtIGJpdHMpXG5cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiVG9vIG1hbnkgYml0cyFcIlxuICAgICAgICAgICAgXG4gICAgICAgIGlmIHNpZ25lZFxuICAgICAgICAgICAgIyBpZiB0aGUgc2lnbiBiaXQgaXMgdHVybmVkIG9uLCBmbGlwIHRoZSBiaXRzIGFuZCBcbiAgICAgICAgICAgICMgYWRkIG9uZSB0byBjb252ZXJ0IHRvIGEgbmVnYXRpdmUgdmFsdWVcbiAgICAgICAgICAgIGlmIG1CaXRzIDwgMzJcbiAgICAgICAgICAgICAgICBpZiBhID4+PiAoYml0cyAtIDEpXG4gICAgICAgICAgICAgICAgICAgIGEgPSAoKDEgPDwgYml0cyA+Pj4gMCkgLSBhKSAqIC0xXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgaWYgYSAvIE1hdGgucG93KDIsIGJpdHMgLSAxKSB8IDBcbiAgICAgICAgICAgICAgICAgICAgYSA9IChNYXRoLnBvdygyLCBiaXRzKSAtIGEpICogLTFcblxuICAgICAgICByZXR1cm4gYVxuXG4gICAgcmVhZExTQjogKGJpdHMsIHNpZ25lZCkgLT5cbiAgICAgICAgcmV0dXJuIDAgaWYgYml0cyBpcyAwXG4gICAgICAgIGlmIGJpdHMgPiA0MFxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiVG9vIG1hbnkgYml0cyFcIlxuXG4gICAgICAgIG1CaXRzID0gYml0cyArIEBiaXRQb3NpdGlvblxuICAgICAgICBhICA9IChAc3RyZWFtLnBlZWtVSW50OCgwKSkgPj4+IEBiaXRQb3NpdGlvblxuICAgICAgICBhIHw9IChAc3RyZWFtLnBlZWtVSW50OCgxKSkgPDwgKDggIC0gQGJpdFBvc2l0aW9uKSBpZiBtQml0cyA+IDhcbiAgICAgICAgYSB8PSAoQHN0cmVhbS5wZWVrVUludDgoMikpIDw8ICgxNiAtIEBiaXRQb3NpdGlvbikgaWYgbUJpdHMgPiAxNlxuICAgICAgICBhICs9IChAc3RyZWFtLnBlZWtVSW50OCgzKSkgPDwgKDI0IC0gQGJpdFBvc2l0aW9uKSA+Pj4gMCBpZiBtQml0cyA+IDI0ICAgICAgICAgICAgXG4gICAgICAgIGEgKz0gKEBzdHJlYW0ucGVla1VJbnQ4KDQpKSAqIE1hdGgucG93KDIsIDMyIC0gQGJpdFBvc2l0aW9uKSBpZiBtQml0cyA+IDMyXG5cbiAgICAgICAgaWYgbUJpdHMgPj0gMzJcbiAgICAgICAgICAgIGEgJT0gTWF0aC5wb3coMiwgYml0cylcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgYSAmPSAoMSA8PCBiaXRzKSAtIDFcbiAgICAgICAgICAgIFxuICAgICAgICBpZiBzaWduZWRcbiAgICAgICAgICAgICMgaWYgdGhlIHNpZ24gYml0IGlzIHR1cm5lZCBvbiwgZmxpcCB0aGUgYml0cyBhbmQgXG4gICAgICAgICAgICAjIGFkZCBvbmUgdG8gY29udmVydCB0byBhIG5lZ2F0aXZlIHZhbHVlXG4gICAgICAgICAgICBpZiBtQml0cyA8IDMyXG4gICAgICAgICAgICAgICAgaWYgYSA+Pj4gKGJpdHMgLSAxKVxuICAgICAgICAgICAgICAgICAgICBhID0gKCgxIDw8IGJpdHMgPj4+IDApIC0gYSkgKiAtMVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGlmIGEgLyBNYXRoLnBvdygyLCBiaXRzIC0gMSkgfCAwXG4gICAgICAgICAgICAgICAgICAgIGEgPSAoTWF0aC5wb3coMiwgYml0cykgLSBhKSAqIC0xXG5cbiAgICAgICAgQGFkdmFuY2UgYml0c1xuICAgICAgICByZXR1cm4gYVxuICAgICAgICBcbiAgICBwZWVrTFNCOiAoYml0cywgc2lnbmVkKSAtPlxuICAgICAgICByZXR1cm4gMCBpZiBiaXRzIGlzIDBcbiAgICAgICAgaWYgYml0cyA+IDQwXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJUb28gbWFueSBiaXRzIVwiXG5cbiAgICAgICAgbUJpdHMgPSBiaXRzICsgQGJpdFBvc2l0aW9uXG4gICAgICAgIGEgID0gKEBzdHJlYW0ucGVla1VJbnQ4KDApKSA+Pj4gQGJpdFBvc2l0aW9uXG4gICAgICAgIGEgfD0gKEBzdHJlYW0ucGVla1VJbnQ4KDEpKSA8PCAoOCAgLSBAYml0UG9zaXRpb24pIGlmIG1CaXRzID4gOFxuICAgICAgICBhIHw9IChAc3RyZWFtLnBlZWtVSW50OCgyKSkgPDwgKDE2IC0gQGJpdFBvc2l0aW9uKSBpZiBtQml0cyA+IDE2XG4gICAgICAgIGEgKz0gKEBzdHJlYW0ucGVla1VJbnQ4KDMpKSA8PCAoMjQgLSBAYml0UG9zaXRpb24pID4+PiAwIGlmIG1CaXRzID4gMjQgICAgICAgICAgICBcbiAgICAgICAgYSArPSAoQHN0cmVhbS5wZWVrVUludDgoNCkpICogTWF0aC5wb3coMiwgMzIgLSBAYml0UG9zaXRpb24pIGlmIG1CaXRzID4gMzJcbiAgICAgICAgXG4gICAgICAgIGlmIG1CaXRzID49IDMyXG4gICAgICAgICAgICBhICU9IE1hdGgucG93KDIsIGJpdHMpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGEgJj0gKDEgPDwgYml0cykgLSAxXG4gICAgICAgICAgICBcbiAgICAgICAgaWYgc2lnbmVkXG4gICAgICAgICAgICAjIGlmIHRoZSBzaWduIGJpdCBpcyB0dXJuZWQgb24sIGZsaXAgdGhlIGJpdHMgYW5kIFxuICAgICAgICAgICAgIyBhZGQgb25lIHRvIGNvbnZlcnQgdG8gYSBuZWdhdGl2ZSB2YWx1ZVxuICAgICAgICAgICAgaWYgbUJpdHMgPCAzMlxuICAgICAgICAgICAgICAgIGlmIGEgPj4+IChiaXRzIC0gMSlcbiAgICAgICAgICAgICAgICAgICAgYSA9ICgoMSA8PCBiaXRzID4+PiAwKSAtIGEpICogLTFcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBpZiBhIC8gTWF0aC5wb3coMiwgYml0cyAtIDEpIHwgMFxuICAgICAgICAgICAgICAgICAgICBhID0gKE1hdGgucG93KDIsIGJpdHMpIC0gYSkgKiAtMVxuXG4gICAgICAgIHJldHVybiBhXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBCaXRzdHJlYW1cbiIsImNsYXNzIEFWQnVmZmVyXG4gICAgY29uc3RydWN0b3I6IChpbnB1dCkgLT5cbiAgICAgICAgaWYgaW5wdXQgaW5zdGFuY2VvZiBVaW50OEFycmF5ICAgICAgICAgICAgICAgICAgIyBVaW50OEFycmF5XG4gICAgICAgICAgICBAZGF0YSA9IGlucHV0XG4gICAgICAgICAgICBcbiAgICAgICAgZWxzZSBpZiBpbnB1dCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyIG9yICAgICAgICAgIyBBcnJheUJ1ZmZlclxuICAgICAgICAgIEFycmF5LmlzQXJyYXkoaW5wdXQpIG9yICAgICAgICAgICAgICAgICAgICAgICAjIG5vcm1hbCBKUyBBcnJheVxuICAgICAgICAgIHR5cGVvZiBpbnB1dCBpcyAnbnVtYmVyJyBvciAgICAgICAgICAgICAgICAgICAjIG51bWJlciAoaS5lLiBsZW5ndGgpXG4gICAgICAgICAgZ2xvYmFsLkJ1ZmZlcj8uaXNCdWZmZXIoaW5wdXQpICAgICAgICAgICAgICAgICMgTm9kZSBCdWZmZXJcbiAgICAgICAgICAgIEBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoaW5wdXQpXG4gICAgICAgICAgICBcbiAgICAgICAgZWxzZSBpZiBpbnB1dC5idWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlciAgICAgIyB0eXBlZCBhcnJheXMgb3RoZXIgdGhhbiBVaW50OEFycmF5XG4gICAgICAgICAgICBAZGF0YSA9IG5ldyBVaW50OEFycmF5KGlucHV0LmJ1ZmZlciwgaW5wdXQuYnl0ZU9mZnNldCwgaW5wdXQubGVuZ3RoICogaW5wdXQuQllURVNfUEVSX0VMRU1FTlQpXG4gICAgICAgICAgICBcbiAgICAgICAgZWxzZSBpZiBpbnB1dCBpbnN0YW5jZW9mIEFWQnVmZmVyICAgICAgICAgICAgICAgIyBBVkJ1ZmZlciwgbWFrZSBhIHNoYWxsb3cgY29weVxuICAgICAgICAgICAgQGRhdGEgPSBpbnB1dC5kYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiQ29uc3RydWN0aW5nIGJ1ZmZlciB3aXRoIHVua25vd24gdHlwZS5cIlxuICAgICAgICBcbiAgICAgICAgQGxlbmd0aCA9IEBkYXRhLmxlbmd0aFxuICAgICAgICBcbiAgICAgICAgIyB1c2VkIHdoZW4gdGhlIGJ1ZmZlciBpcyBwYXJ0IG9mIGEgYnVmZmVybGlzdFxuICAgICAgICBAbmV4dCA9IG51bGxcbiAgICAgICAgQHByZXYgPSBudWxsXG4gICAgXG4gICAgQGFsbG9jYXRlOiAoc2l6ZSkgLT5cbiAgICAgICAgcmV0dXJuIG5ldyBBVkJ1ZmZlcihzaXplKVxuICAgIFxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJldHVybiBuZXcgQVZCdWZmZXIobmV3IFVpbnQ4QXJyYXkoQGRhdGEpKVxuICAgIFxuICAgIHNsaWNlOiAocG9zaXRpb24sIGxlbmd0aCA9IEBsZW5ndGgpIC0+XG4gICAgICAgIGlmIHBvc2l0aW9uIGlzIDAgYW5kIGxlbmd0aCA+PSBAbGVuZ3RoXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFWQnVmZmVyKEBkYXRhKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFWQnVmZmVyKEBkYXRhLnN1YmFycmF5KHBvc2l0aW9uLCBwb3NpdGlvbiArIGxlbmd0aCkpXG4gICAgXG4gICAgIyBwcmVmaXgtZnJlZVxuICAgIEJsb2JCdWlsZGVyID0gZ2xvYmFsLkJsb2JCdWlsZGVyIG9yIGdsb2JhbC5Nb3pCbG9iQnVpbGRlciBvciBnbG9iYWwuV2ViS2l0QmxvYkJ1aWxkZXJcbiAgICBVUkwgPSBnbG9iYWwuVVJMIG9yIGdsb2JhbC53ZWJraXRVUkwgb3IgZ2xvYmFsLm1velVSTFxuICAgIFxuICAgIEBtYWtlQmxvYjogKGRhdGEsIHR5cGUgPSAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJykgLT5cbiAgICAgICAgIyB0cnkgdGhlIEJsb2IgY29uc3RydWN0b3JcbiAgICAgICAgdHJ5IFxuICAgICAgICAgICAgcmV0dXJuIG5ldyBCbG9iIFtkYXRhXSwgdHlwZTogdHlwZVxuICAgICAgICBcbiAgICAgICAgIyB1c2UgdGhlIG9sZCBCbG9iQnVpbGRlclxuICAgICAgICBpZiBCbG9iQnVpbGRlcj9cbiAgICAgICAgICAgIGJiID0gbmV3IEJsb2JCdWlsZGVyXG4gICAgICAgICAgICBiYi5hcHBlbmQgZGF0YVxuICAgICAgICAgICAgcmV0dXJuIGJiLmdldEJsb2IodHlwZSlcbiAgICAgICAgICAgIFxuICAgICAgICAjIG9vcHMsIG5vIGJsb2JzIHN1cHBvcnRlZCA6KFxuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICBcbiAgICBAbWFrZUJsb2JVUkw6IChkYXRhLCB0eXBlKSAtPlxuICAgICAgICByZXR1cm4gVVJMPy5jcmVhdGVPYmplY3RVUkwgQG1ha2VCbG9iKGRhdGEsIHR5cGUpXG4gICAgICAgIFxuICAgIEByZXZva2VCbG9iVVJMOiAodXJsKSAtPlxuICAgICAgICBVUkw/LnJldm9rZU9iamVjdFVSTCB1cmxcbiAgICBcbiAgICB0b0Jsb2I6IC0+XG4gICAgICAgIHJldHVybiBBVkJ1ZmZlci5tYWtlQmxvYiBAZGF0YS5idWZmZXJcbiAgICAgICAgXG4gICAgdG9CbG9iVVJMOiAtPlxuICAgICAgICByZXR1cm4gQVZCdWZmZXIubWFrZUJsb2JVUkwgQGRhdGEuYnVmZmVyXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBBVkJ1ZmZlclxuIiwiY2xhc3MgQnVmZmVyTGlzdFxuICAgIGNvbnN0cnVjdG9yOiAtPlxuICAgICAgICBAZmlyc3QgPSBudWxsXG4gICAgICAgIEBsYXN0ID0gbnVsbFxuICAgICAgICBAbnVtQnVmZmVycyA9IDBcbiAgICAgICAgQGF2YWlsYWJsZUJ5dGVzID0gMFxuICAgICAgICBAYXZhaWxhYmxlQnVmZmVycyA9IDAgICAgICAgIFxuICAgIFxuICAgIGNvcHk6IC0+XG4gICAgICAgIHJlc3VsdCA9IG5ldyBCdWZmZXJMaXN0XG5cbiAgICAgICAgcmVzdWx0LmZpcnN0ID0gQGZpcnN0XG4gICAgICAgIHJlc3VsdC5sYXN0ID0gQGxhc3RcbiAgICAgICAgcmVzdWx0Lm51bUJ1ZmZlcnMgPSBAbnVtQnVmZmVyc1xuICAgICAgICByZXN1bHQuYXZhaWxhYmxlQnl0ZXMgPSBAYXZhaWxhYmxlQnl0ZXNcbiAgICAgICAgcmVzdWx0LmF2YWlsYWJsZUJ1ZmZlcnMgPSBAYXZhaWxhYmxlQnVmZmVyc1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICBcbiAgICBhcHBlbmQ6IChidWZmZXIpIC0+XG4gICAgICAgIGJ1ZmZlci5wcmV2ID0gQGxhc3RcbiAgICAgICAgQGxhc3Q/Lm5leHQgPSBidWZmZXJcbiAgICAgICAgQGxhc3QgPSBidWZmZXJcbiAgICAgICAgQGZpcnN0ID89IGJ1ZmZlclxuICAgICAgICBcbiAgICAgICAgQGF2YWlsYWJsZUJ5dGVzICs9IGJ1ZmZlci5sZW5ndGhcbiAgICAgICAgQGF2YWlsYWJsZUJ1ZmZlcnMrK1xuICAgICAgICBAbnVtQnVmZmVycysrXG4gICAgICAgIFxuICAgIGFkdmFuY2U6IC0+XG4gICAgICAgIGlmIEBmaXJzdFxuICAgICAgICAgICAgQGF2YWlsYWJsZUJ5dGVzIC09IEBmaXJzdC5sZW5ndGhcbiAgICAgICAgICAgIEBhdmFpbGFibGVCdWZmZXJzLS1cbiAgICAgICAgICAgIEBmaXJzdCA9IEBmaXJzdC5uZXh0XG4gICAgICAgICAgICByZXR1cm4gQGZpcnN0P1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBcbiAgICByZXdpbmQ6IC0+XG4gICAgICAgIGlmIEBmaXJzdCBhbmQgbm90IEBmaXJzdC5wcmV2XG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgXG4gICAgICAgIEBmaXJzdCA9IEBmaXJzdD8ucHJldiBvciBAbGFzdFxuICAgICAgICBpZiBAZmlyc3RcbiAgICAgICAgICAgIEBhdmFpbGFibGVCeXRlcyArPSBAZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBAYXZhaWxhYmxlQnVmZmVycysrXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIEBmaXJzdD9cbiAgICAgICAgXG4gICAgcmVzZXQ6IC0+XG4gICAgICAgIGNvbnRpbnVlIHdoaWxlIEByZXdpbmQoKVxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gQnVmZmVyTGlzdFxuIiwiQmFzZSA9IHJlcXVpcmUgJy4vYmFzZSdcblxuY2xhc3MgRXZlbnRFbWl0dGVyIGV4dGVuZHMgQmFzZVxuICAgIG9uOiAoZXZlbnQsIGZuKSAtPlxuICAgICAgICBAZXZlbnRzID89IHt9XG4gICAgICAgIEBldmVudHNbZXZlbnRdID89IFtdXG4gICAgICAgIEBldmVudHNbZXZlbnRdLnB1c2goZm4pXG4gICAgICAgIFxuICAgIG9mZjogKGV2ZW50LCBmbikgLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAZXZlbnRzP1xuICAgICAgICBpZiBAZXZlbnRzP1tldmVudF1cbiAgICAgICAgICAgIGlmIGZuP1xuICAgICAgICAgICAgICAgIGluZGV4ID0gQGV2ZW50c1tldmVudF0uaW5kZXhPZihmbilcbiAgICAgICAgICAgICAgICBAZXZlbnRzW2V2ZW50XS5zcGxpY2UoaW5kZXgsIDEpIGlmIH5pbmRleFxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIEBldmVudHNbZXZlbnRdXG4gICAgICAgIGVsc2UgdW5sZXNzIGV2ZW50P1xuICAgICAgICAgICAgZXZlbnRzID0ge31cbiAgICAgICAgXG4gICAgb25jZTogKGV2ZW50LCBmbikgLT5cbiAgICAgICAgQG9uIGV2ZW50LCBjYiA9IC0+XG4gICAgICAgICAgICBAb2ZmIGV2ZW50LCBjYlxuICAgICAgICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgICBcbiAgICBlbWl0OiAoZXZlbnQsIGFyZ3MuLi4pIC0+XG4gICAgICAgIHJldHVybiB1bmxlc3MgQGV2ZW50cz9bZXZlbnRdXG4gICAgICAgIFxuICAgICAgICAjIHNoYWxsb3cgY2xvbmUgd2l0aCAuc2xpY2UoKSBzbyB0aGF0IHJlbW92aW5nIGEgaGFuZGxlclxuICAgICAgICAjIHdoaWxlIGV2ZW50IGlzIGZpcmluZyAoYXMgaW4gb25jZSkgZG9lc24ndCBjYXVzZSBlcnJvcnNcbiAgICAgICAgZm9yIGZuIGluIEBldmVudHNbZXZlbnRdLnNsaWNlKClcbiAgICAgICAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3MpXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXJcbiIsIkJ1ZmZlckxpc3QgPSByZXF1aXJlICcuL2J1ZmZlcmxpc3QnXG5BVkJ1ZmZlciA9IHJlcXVpcmUgJy4vYnVmZmVyJ1xuVW5kZXJmbG93RXJyb3IgPSByZXF1aXJlICcuL3VuZGVyZmxvdydcblxuY2xhc3MgU3RyZWFtXG4gICAgYnVmID0gbmV3IEFycmF5QnVmZmVyKDE2KVxuICAgIHVpbnQ4ID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGludDggPSBuZXcgSW50OEFycmF5KGJ1ZilcbiAgICB1aW50MTYgPSBuZXcgVWludDE2QXJyYXkoYnVmKVxuICAgIGludDE2ID0gbmV3IEludDE2QXJyYXkoYnVmKVxuICAgIHVpbnQzMiA9IG5ldyBVaW50MzJBcnJheShidWYpXG4gICAgaW50MzIgPSBuZXcgSW50MzJBcnJheShidWYpXG4gICAgZmxvYXQzMiA9IG5ldyBGbG9hdDMyQXJyYXkoYnVmKVxuICAgIGZsb2F0NjQgPSBuZXcgRmxvYXQ2NEFycmF5KGJ1ZikgaWYgRmxvYXQ2NEFycmF5P1xuICAgIFxuICAgICMgZGV0ZWN0IHRoZSBuYXRpdmUgZW5kaWFubmVzcyBvZiB0aGUgbWFjaGluZVxuICAgICMgMHgzNDEyIGlzIGxpdHRsZSBlbmRpYW4sIDB4MTIzNCBpcyBiaWcgZW5kaWFuXG4gICAgbmF0aXZlRW5kaWFuID0gbmV3IFVpbnQxNkFycmF5KG5ldyBVaW50OEFycmF5KFsweDEyLCAweDM0XSkuYnVmZmVyKVswXSBpcyAweDM0MTJcbiAgICAgICAgXG4gICAgY29uc3RydWN0b3I6IChAbGlzdCkgLT5cbiAgICAgICAgQGxvY2FsT2Zmc2V0ID0gMFxuICAgICAgICBAb2Zmc2V0ID0gMFxuICAgICAgICBcbiAgICBAZnJvbUJ1ZmZlcjogKGJ1ZmZlcikgLT5cbiAgICAgICAgbGlzdCA9IG5ldyBCdWZmZXJMaXN0XG4gICAgICAgIGxpc3QuYXBwZW5kKGJ1ZmZlcilcbiAgICAgICAgcmV0dXJuIG5ldyBTdHJlYW0obGlzdClcbiAgICBcbiAgICBjb3B5OiAtPlxuICAgICAgICByZXN1bHQgPSBuZXcgU3RyZWFtKEBsaXN0LmNvcHkoKSlcbiAgICAgICAgcmVzdWx0LmxvY2FsT2Zmc2V0ID0gQGxvY2FsT2Zmc2V0XG4gICAgICAgIHJlc3VsdC5vZmZzZXQgPSBAb2Zmc2V0XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICBcbiAgICBhdmFpbGFibGU6IChieXRlcykgLT5cbiAgICAgICAgcmV0dXJuIGJ5dGVzIDw9IEBsaXN0LmF2YWlsYWJsZUJ5dGVzIC0gQGxvY2FsT2Zmc2V0XG4gICAgICAgIFxuICAgIHJlbWFpbmluZ0J5dGVzOiAtPlxuICAgICAgICByZXR1cm4gQGxpc3QuYXZhaWxhYmxlQnl0ZXMgLSBAbG9jYWxPZmZzZXRcbiAgICBcbiAgICBhZHZhbmNlOiAoYnl0ZXMpIC0+XG4gICAgICAgIGlmIG5vdCBAYXZhaWxhYmxlIGJ5dGVzXG4gICAgICAgICAgICB0aHJvdyBuZXcgVW5kZXJmbG93RXJyb3IoKVxuICAgICAgICBcbiAgICAgICAgQGxvY2FsT2Zmc2V0ICs9IGJ5dGVzXG4gICAgICAgIEBvZmZzZXQgKz0gYnl0ZXNcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIEBsaXN0LmZpcnN0IGFuZCBAbG9jYWxPZmZzZXQgPj0gQGxpc3QuZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBAbG9jYWxPZmZzZXQgLT0gQGxpc3QuZmlyc3QubGVuZ3RoXG4gICAgICAgICAgICBAbGlzdC5hZHZhbmNlKClcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIFxuICAgIHJld2luZDogKGJ5dGVzKSAtPlxuICAgICAgICBpZiBieXRlcyA+IEBvZmZzZXRcbiAgICAgICAgICAgIHRocm93IG5ldyBVbmRlcmZsb3dFcnJvcigpXG4gICAgICAgIFxuICAgICAgICAjIGlmIHdlJ3JlIGF0IHRoZSBlbmQgb2YgdGhlIGJ1ZmZlcmxpc3QsIHNlZWsgZnJvbSB0aGUgZW5kXG4gICAgICAgIGlmIG5vdCBAbGlzdC5maXJzdFxuICAgICAgICAgICAgQGxpc3QucmV3aW5kKClcbiAgICAgICAgICAgIEBsb2NhbE9mZnNldCA9IEBsaXN0LmZpcnN0Lmxlbmd0aFxuICAgICAgICAgICAgXG4gICAgICAgIEBsb2NhbE9mZnNldCAtPSBieXRlc1xuICAgICAgICBAb2Zmc2V0IC09IGJ5dGVzXG4gICAgICAgIFxuICAgICAgICB3aGlsZSBAbGlzdC5maXJzdC5wcmV2IGFuZCBAbG9jYWxPZmZzZXQgPCAwXG4gICAgICAgICAgICBAbGlzdC5yZXdpbmQoKVxuICAgICAgICAgICAgQGxvY2FsT2Zmc2V0ICs9IEBsaXN0LmZpcnN0Lmxlbmd0aFxuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIFxuICAgIHNlZWs6IChwb3NpdGlvbikgLT5cbiAgICAgICAgaWYgcG9zaXRpb24gPiBAb2Zmc2V0XG4gICAgICAgICAgICBAYWR2YW5jZSBwb3NpdGlvbiAtIEBvZmZzZXRcbiAgICAgICAgICAgIFxuICAgICAgICBlbHNlIGlmIHBvc2l0aW9uIDwgQG9mZnNldFxuICAgICAgICAgICAgQHJld2luZCBAb2Zmc2V0IC0gcG9zaXRpb25cbiAgICAgICAgXG4gICAgcmVhZFVJbnQ4OiAtPlxuICAgICAgICBpZiBub3QgQGF2YWlsYWJsZSgxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFVuZGVyZmxvd0Vycm9yKClcbiAgICAgICAgXG4gICAgICAgIGEgPSBAbGlzdC5maXJzdC5kYXRhW0Bsb2NhbE9mZnNldF1cbiAgICAgICAgQGxvY2FsT2Zmc2V0ICs9IDFcbiAgICAgICAgQG9mZnNldCArPSAxXG5cbiAgICAgICAgaWYgQGxvY2FsT2Zmc2V0ID09IEBsaXN0LmZpcnN0Lmxlbmd0aFxuICAgICAgICAgICAgQGxvY2FsT2Zmc2V0ID0gMFxuICAgICAgICAgICAgQGxpc3QuYWR2YW5jZSgpXG5cbiAgICAgICAgcmV0dXJuIGFcblxuICAgIHBlZWtVSW50ODogKG9mZnNldCA9IDApIC0+XG4gICAgICAgIGlmIG5vdCBAYXZhaWxhYmxlKG9mZnNldCArIDEpXG4gICAgICAgICAgICB0aHJvdyBuZXcgVW5kZXJmbG93RXJyb3IoKVxuICAgICAgICBcbiAgICAgICAgb2Zmc2V0ID0gQGxvY2FsT2Zmc2V0ICsgb2Zmc2V0XG4gICAgICAgIGJ1ZmZlciA9IEBsaXN0LmZpcnN0XG5cbiAgICAgICAgd2hpbGUgYnVmZmVyXG4gICAgICAgICAgICBpZiBidWZmZXIubGVuZ3RoID4gb2Zmc2V0XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ1ZmZlci5kYXRhW29mZnNldF1cblxuICAgICAgICAgICAgb2Zmc2V0IC09IGJ1ZmZlci5sZW5ndGhcbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlci5uZXh0XG5cbiAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgXG4gICAgcmVhZDogKGJ5dGVzLCBsaXR0bGVFbmRpYW4gPSBmYWxzZSkgLT5cbiAgICAgICAgaWYgbGl0dGxlRW5kaWFuIGlzIG5hdGl2ZUVuZGlhblxuICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5ieXRlc10gYnkgMVxuICAgICAgICAgICAgICAgIHVpbnQ4W2ldID0gQHJlYWRVSW50OCgpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGZvciBpIGluIFtieXRlcyAtIDEuLjBdIGJ5IC0xXG4gICAgICAgICAgICAgICAgdWludDhbaV0gPSBAcmVhZFVJbnQ4KClcbiAgICAgICAgXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICBwZWVrOiAoYnl0ZXMsIG9mZnNldCwgbGl0dGxlRW5kaWFuID0gZmFsc2UpIC0+XG4gICAgICAgIGlmIGxpdHRsZUVuZGlhbiBpcyBuYXRpdmVFbmRpYW5cbiAgICAgICAgICAgIGZvciBpIGluIFswLi4uYnl0ZXNdIGJ5IDFcbiAgICAgICAgICAgICAgICB1aW50OFtpXSA9IEBwZWVrVUludDgob2Zmc2V0ICsgaSlcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5ieXRlc10gYnkgMVxuICAgICAgICAgICAgICAgIHVpbnQ4W2J5dGVzIC0gaSAtIDFdID0gQHBlZWtVSW50OChvZmZzZXQgKyBpKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG4gICAgcmVhZEludDg6IC0+XG4gICAgICAgIEByZWFkKDEpXG4gICAgICAgIHJldHVybiBpbnQ4WzBdXG5cbiAgICBwZWVrSW50ODogKG9mZnNldCA9IDApIC0+XG4gICAgICAgIEBwZWVrKDEsIG9mZnNldClcbiAgICAgICAgcmV0dXJuIGludDhbMF1cbiAgICAgICAgXG4gICAgcmVhZFVJbnQxNjogKGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHJlYWQoMiwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gdWludDE2WzBdXG5cbiAgICBwZWVrVUludDE2OiAob2Zmc2V0ID0gMCwgbGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcGVlaygyLCBvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIHVpbnQxNlswXVxuXG4gICAgcmVhZEludDE2OiAobGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcmVhZCgyLCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiBpbnQxNlswXVxuXG4gICAgcGVla0ludDE2OiAob2Zmc2V0ID0gMCwgbGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcGVlaygyLCBvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIGludDE2WzBdXG4gICAgICAgIFxuICAgIHJlYWRVSW50MjQ6IChsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIGlmIGxpdHRsZUVuZGlhblxuICAgICAgICAgICAgcmV0dXJuIEByZWFkVUludDE2KHRydWUpICsgKEByZWFkVUludDgoKSA8PCAxNilcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIChAcmVhZFVJbnQxNigpIDw8IDgpICsgQHJlYWRVSW50OCgpXG5cbiAgICBwZWVrVUludDI0OiAob2Zmc2V0ID0gMCwgbGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBpZiBsaXR0bGVFbmRpYW5cbiAgICAgICAgICAgIHJldHVybiBAcGVla1VJbnQxNihvZmZzZXQsIHRydWUpICsgKEBwZWVrVUludDgob2Zmc2V0ICsgMikgPDwgMTYpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiAoQHBlZWtVSW50MTYob2Zmc2V0KSA8PCA4KSArIEBwZWVrVUludDgob2Zmc2V0ICsgMilcblxuICAgIHJlYWRJbnQyNDogKGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgaWYgbGl0dGxlRW5kaWFuXG4gICAgICAgICAgICByZXR1cm4gQHJlYWRVSW50MTYodHJ1ZSkgKyAoQHJlYWRJbnQ4KCkgPDwgMTYpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiAoQHJlYWRJbnQxNigpIDw8IDgpICsgQHJlYWRVSW50OCgpXG5cbiAgICBwZWVrSW50MjQ6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIGlmIGxpdHRsZUVuZGlhblxuICAgICAgICAgICAgcmV0dXJuIEBwZWVrVUludDE2KG9mZnNldCwgdHJ1ZSkgKyAoQHBlZWtJbnQ4KG9mZnNldCArIDIpIDw8IDE2KVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gKEBwZWVrSW50MTYob2Zmc2V0KSA8PCA4KSArIEBwZWVrVUludDgob2Zmc2V0ICsgMilcbiAgICBcbiAgICByZWFkVUludDMyOiAobGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcmVhZCg0LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiB1aW50MzJbMF1cbiAgICBcbiAgICBwZWVrVUludDMyOiAob2Zmc2V0ID0gMCwgbGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcGVlayg0LCBvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIHVpbnQzMlswXVxuICAgIFxuICAgIHJlYWRJbnQzMjogKGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHJlYWQoNCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gaW50MzJbMF1cbiAgICBcbiAgICBwZWVrSW50MzI6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEBwZWVrKDQsIG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gaW50MzJbMF1cbiAgICAgICAgXG4gICAgcmVhZEZsb2F0MzI6IChsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEByZWFkKDQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIGZsb2F0MzJbMF1cbiAgICAgICAgXG4gICAgcGVla0Zsb2F0MzI6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEBwZWVrKDQsIG9mZnNldCwgbGl0dGxlRW5kaWFuKVxuICAgICAgICByZXR1cm4gZmxvYXQzMlswXVxuICAgIFxuICAgIHJlYWRGbG9hdDY0OiAobGl0dGxlRW5kaWFuKSAtPlxuICAgICAgICBAcmVhZCg4LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIFxuICAgICAgICAjIHVzZSBGbG9hdDY0QXJyYXkgaWYgYXZhaWxhYmxlXG4gICAgICAgIGlmIGZsb2F0NjRcbiAgICAgICAgICAgIHJldHVybiBmbG9hdDY0WzBdXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBmbG9hdDY0RmFsbGJhY2soKVxuICAgICAgICAgICAgXG4gICAgZmxvYXQ2NEZhbGxiYWNrID0gLT5cbiAgICAgICAgW2xvdywgaGlnaF0gPSB1aW50MzJcbiAgICAgICAgcmV0dXJuIDAuMCBpZiBub3QgaGlnaCBvciBoaWdoIGlzIDB4ODAwMDAwMDBcblxuICAgICAgICBzaWduID0gMSAtIChoaWdoID4+PiAzMSkgKiAyICMgKzEgb3IgLTFcbiAgICAgICAgZXhwID0gKGhpZ2ggPj4+IDIwKSAmIDB4N2ZmXG4gICAgICAgIGZyYWMgPSBoaWdoICYgMHhmZmZmZlxuXG4gICAgICAgICMgTmFOIG9yIEluZmluaXR5XG4gICAgICAgIGlmIGV4cCBpcyAweDdmZlxuICAgICAgICAgICAgcmV0dXJuIE5hTiBpZiBmcmFjXG4gICAgICAgICAgICByZXR1cm4gc2lnbiAqIEluZmluaXR5XG5cbiAgICAgICAgZXhwIC09IDEwMjNcbiAgICAgICAgb3V0ID0gKGZyYWMgfCAweDEwMDAwMCkgKiBNYXRoLnBvdygyLCBleHAgLSAyMClcbiAgICAgICAgb3V0ICs9IGxvdyAqIE1hdGgucG93KDIsIGV4cCAtIDUyKVxuXG4gICAgICAgIHJldHVybiBzaWduICogb3V0XG4gICAgICAgICAgICBcbiAgICBwZWVrRmxvYXQ2NDogKG9mZnNldCA9IDAsIGxpdHRsZUVuZGlhbikgLT5cbiAgICAgICAgQHBlZWsoOCwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIFxuICAgICAgICAjIHVzZSBGbG9hdDY0QXJyYXkgaWYgYXZhaWxhYmxlXG4gICAgICAgIGlmIGZsb2F0NjRcbiAgICAgICAgICAgIHJldHVybiBmbG9hdDY0WzBdXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBmbG9hdDY0RmFsbGJhY2soKVxuICAgICAgICBcbiAgICAjIElFRUUgODAgYml0IGV4dGVuZGVkIGZsb2F0XG4gICAgcmVhZEZsb2F0ODA6IChsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEByZWFkKDEwLCBsaXR0bGVFbmRpYW4pXG4gICAgICAgIHJldHVybiBmbG9hdDgwKClcbiAgICAgICAgXG4gICAgZmxvYXQ4MCA9IC0+XG4gICAgICAgIFtoaWdoLCBsb3ddID0gdWludDMyXG4gICAgICAgIGEwID0gdWludDhbOV1cbiAgICAgICAgYTEgPSB1aW50OFs4XVxuICAgICAgICBcbiAgICAgICAgc2lnbiA9IDEgLSAoYTAgPj4+IDcpICogMiAjIC0xIG9yICsxXG4gICAgICAgIGV4cCA9ICgoYTAgJiAweDdGKSA8PCA4KSB8IGExXG4gICAgICAgIFxuICAgICAgICBpZiBleHAgaXMgMCBhbmQgbG93IGlzIDAgYW5kIGhpZ2ggaXMgMFxuICAgICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgICAgIFxuICAgICAgICBpZiBleHAgaXMgMHg3ZmZmXG4gICAgICAgICAgICBpZiBsb3cgaXMgMCBhbmQgaGlnaCBpcyAwXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNpZ24gKiBJbmZpbml0eVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIE5hTlxuICAgICAgICBcbiAgICAgICAgZXhwIC09IDE2MzgzXG4gICAgICAgIG91dCA9IGxvdyAqIE1hdGgucG93KDIsIGV4cCAtIDMxKVxuICAgICAgICBvdXQgKz0gaGlnaCAqIE1hdGgucG93KDIsIGV4cCAtIDYzKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHNpZ24gKiBvdXRcbiAgICAgICAgXG4gICAgcGVla0Zsb2F0ODA6IChvZmZzZXQgPSAwLCBsaXR0bGVFbmRpYW4pIC0+XG4gICAgICAgIEBwZWVrKDEwLCBvZmZzZXQsIGxpdHRsZUVuZGlhbilcbiAgICAgICAgcmV0dXJuIGZsb2F0ODAoKVxuICAgICAgICBcbiAgICByZWFkQnVmZmVyOiAobGVuZ3RoKSAtPlxuICAgICAgICByZXN1bHQgPSBBVkJ1ZmZlci5hbGxvY2F0ZShsZW5ndGgpXG4gICAgICAgIHRvID0gcmVzdWx0LmRhdGFcblxuICAgICAgICBmb3IgaSBpbiBbMC4uLmxlbmd0aF0gYnkgMVxuICAgICAgICAgICAgdG9baV0gPSBAcmVhZFVJbnQ4KClcblxuICAgICAgICByZXR1cm4gcmVzdWx0XG5cbiAgICBwZWVrQnVmZmVyOiAob2Zmc2V0ID0gMCwgbGVuZ3RoKSAtPlxuICAgICAgICByZXN1bHQgPSBBVkJ1ZmZlci5hbGxvY2F0ZShsZW5ndGgpXG4gICAgICAgIHRvID0gcmVzdWx0LmRhdGFcblxuICAgICAgICBmb3IgaSBpbiBbMC4uLmxlbmd0aF0gYnkgMVxuICAgICAgICAgICAgdG9baV0gPSBAcGVla1VJbnQ4KG9mZnNldCArIGkpXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuXG4gICAgcmVhZFNpbmdsZUJ1ZmZlcjogKGxlbmd0aCkgLT5cbiAgICAgICAgcmVzdWx0ID0gQGxpc3QuZmlyc3Quc2xpY2UoQGxvY2FsT2Zmc2V0LCBsZW5ndGgpXG4gICAgICAgIEBhZHZhbmNlKHJlc3VsdC5sZW5ndGgpXG4gICAgICAgIHJldHVybiByZXN1bHRcblxuICAgIHBlZWtTaW5nbGVCdWZmZXI6IChvZmZzZXQsIGxlbmd0aCkgLT5cbiAgICAgICAgcmVzdWx0ID0gQGxpc3QuZmlyc3Quc2xpY2UoQGxvY2FsT2Zmc2V0ICsgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICBcbiAgICByZWFkU3RyaW5nOiAobGVuZ3RoLCBlbmNvZGluZyA9ICdhc2NpaScpIC0+XG4gICAgICAgIHJldHVybiBkZWNvZGVTdHJpbmcuY2FsbCB0aGlzLCAwLCBsZW5ndGgsIGVuY29kaW5nLCB0cnVlXG5cbiAgICBwZWVrU3RyaW5nOiAob2Zmc2V0ID0gMCwgbGVuZ3RoLCBlbmNvZGluZyA9ICdhc2NpaScpIC0+XG4gICAgICAgIHJldHVybiBkZWNvZGVTdHJpbmcuY2FsbCB0aGlzLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcsIGZhbHNlXG5cbiAgICBkZWNvZGVTdHJpbmcgPSAob2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nLCBhZHZhbmNlKSAtPlxuICAgICAgICBlbmNvZGluZyA9IGVuY29kaW5nLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbnVsbEVuZCA9IGlmIGxlbmd0aCBpcyBudWxsIHRoZW4gMCBlbHNlIC0xXG5cbiAgICAgICAgbGVuZ3RoID0gSW5maW5pdHkgaWYgbm90IGxlbmd0aD9cbiAgICAgICAgZW5kID0gb2Zmc2V0ICsgbGVuZ3RoXG4gICAgICAgIHJlc3VsdCA9ICcnXG5cbiAgICAgICAgc3dpdGNoIGVuY29kaW5nXG4gICAgICAgICAgICB3aGVuICdhc2NpaScsICdsYXRpbjEnXG4gICAgICAgICAgICAgICAgd2hpbGUgb2Zmc2V0IDwgZW5kIGFuZCAoYyA9IEBwZWVrVUludDgob2Zmc2V0KyspKSBpc250IG51bGxFbmRcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYylcblxuICAgICAgICAgICAgd2hlbiAndXRmOCcsICd1dGYtOCdcbiAgICAgICAgICAgICAgICB3aGlsZSBvZmZzZXQgPCBlbmQgYW5kIChiMSA9IEBwZWVrVUludDgob2Zmc2V0KyspKSBpc250IG51bGxFbmRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGIxICYgMHg4MCkgaXMgMFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUgYjFcblxuICAgICAgICAgICAgICAgICAgICAjIG9uZSBjb250aW51YXRpb24gKDEyOCB0byAyMDQ3KVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChiMSAmIDB4ZTApIGlzIDB4YzBcbiAgICAgICAgICAgICAgICAgICAgICAgIGIyID0gQHBlZWtVSW50OChvZmZzZXQrKykgJiAweDNmXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSAoKGIxICYgMHgxZikgPDwgNikgfCBiMlxuXG4gICAgICAgICAgICAgICAgICAgICMgdHdvIGNvbnRpbnVhdGlvbiAoMjA0OCB0byA1NTI5NSBhbmQgNTczNDQgdG8gNjU1MzUpXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGIxICYgMHhmMCkgaXMgMHhlMFxuICAgICAgICAgICAgICAgICAgICAgICAgYjIgPSBAcGVla1VJbnQ4KG9mZnNldCsrKSAmIDB4M2ZcbiAgICAgICAgICAgICAgICAgICAgICAgIGIzID0gQHBlZWtVSW50OChvZmZzZXQrKykgJiAweDNmXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSAoKGIxICYgMHgwZikgPDwgMTIpIHwgKGIyIDw8IDYpIHwgYjNcblxuICAgICAgICAgICAgICAgICAgICAjIHRocmVlIGNvbnRpbnVhdGlvbiAoNjU1MzYgdG8gMTExNDExMSlcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoYjEgJiAweGY4KSBpcyAweGYwXG4gICAgICAgICAgICAgICAgICAgICAgICBiMiA9IEBwZWVrVUludDgob2Zmc2V0KyspICYgMHgzZlxuICAgICAgICAgICAgICAgICAgICAgICAgYjMgPSBAcGVla1VJbnQ4KG9mZnNldCsrKSAmIDB4M2ZcbiAgICAgICAgICAgICAgICAgICAgICAgIGI0ID0gQHBlZWtVSW50OChvZmZzZXQrKykgJiAweDNmXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICMgc3BsaXQgaW50byBhIHN1cnJvZ2F0ZSBwYWlyXG4gICAgICAgICAgICAgICAgICAgICAgICBwdCA9ICgoKGIxICYgMHgwZikgPDwgMTgpIHwgKGIyIDw8IDEyKSB8IChiMyA8PCA2KSB8IGI0KSAtIDB4MTAwMDBcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlIDB4ZDgwMCArIChwdCA+PiAxMCksIDB4ZGMwMCArIChwdCAmIDB4M2ZmKVxuXG4gICAgICAgICAgICB3aGVuICd1dGYxNi1iZScsICd1dGYxNmJlJywgJ3V0ZjE2bGUnLCAndXRmMTYtbGUnLCAndXRmMTZib20nLCAndXRmMTYtYm9tJ1xuICAgICAgICAgICAgICAgICMgZmluZCBlbmRpYW5uZXNzXG4gICAgICAgICAgICAgICAgc3dpdGNoIGVuY29kaW5nXG4gICAgICAgICAgICAgICAgICAgIHdoZW4gJ3V0ZjE2YmUnLCAndXRmMTYtYmUnXG4gICAgICAgICAgICAgICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSBmYWxzZVxuXG4gICAgICAgICAgICAgICAgICAgIHdoZW4gJ3V0ZjE2bGUnLCAndXRmMTYtbGUnXG4gICAgICAgICAgICAgICAgICAgICAgICBsaXR0bGVFbmRpYW4gPSB0cnVlXG5cbiAgICAgICAgICAgICAgICAgICAgd2hlbiAndXRmMTZib20nLCAndXRmMTYtYm9tJ1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgbGVuZ3RoIDwgMiBvciAoYm9tID0gQHBlZWtVSW50MTYob2Zmc2V0KSkgaXMgbnVsbEVuZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBhZHZhbmNlIG9mZnNldCArPSAyIGlmIGFkdmFuY2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbiA9IChib20gaXMgMHhmZmZlKVxuICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ICs9IDJcblxuICAgICAgICAgICAgICAgIHdoaWxlIG9mZnNldCA8IGVuZCBhbmQgKHcxID0gQHBlZWtVSW50MTYob2Zmc2V0LCBsaXR0bGVFbmRpYW4pKSBpc250IG51bGxFbmRcbiAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ICs9IDJcblxuICAgICAgICAgICAgICAgICAgICBpZiB3MSA8IDB4ZDgwMCBvciB3MSA+IDB4ZGZmZlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUodzEpXG5cbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgdzEgPiAweGRiZmZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJJbnZhbGlkIHV0ZjE2IHNlcXVlbmNlLlwiXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHcyID0gQHBlZWtVSW50MTYob2Zmc2V0LCBsaXR0bGVFbmRpYW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiB3MiA8IDB4ZGMwMCBvciB3MiA+IDB4ZGZmZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciBcIkludmFsaWQgdXRmMTYgc2VxdWVuY2UuXCJcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUodzEsIHcyKVxuICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ICs9IDJcblxuICAgICAgICAgICAgICAgIGlmIHcxIGlzIG51bGxFbmRcbiAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ICs9IDJcblxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciBcIlVua25vd24gZW5jb2Rpbmc6ICN7ZW5jb2Rpbmd9XCJcblxuICAgICAgICBAYWR2YW5jZSBvZmZzZXQgaWYgYWR2YW5jZVxuICAgICAgICByZXR1cm4gcmVzdWx0XG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBTdHJlYW1cbiIsIiMgZGVmaW5lIGFuIGVycm9yIGNsYXNzIHRvIGJlIHRocm93biBpZiBhbiB1bmRlcmZsb3cgb2NjdXJzXG5jbGFzcyBVbmRlcmZsb3dFcnJvciBleHRlbmRzIEVycm9yXG4gICAgY29uc3RydWN0b3I6IC0+XG4gICAgICAgIHN1cGVyXG4gICAgICAgIEBuYW1lID0gJ1VuZGVyZmxvd0Vycm9yJ1xuICAgICAgICBAc3RhY2sgPSBuZXcgRXJyb3IoKS5zdGFja1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVuZGVyZmxvd0Vycm9yXG4iLCJFdmVudEVtaXR0ZXIgPSByZXF1aXJlICcuL2NvcmUvZXZlbnRzJ1xuQnVmZmVyTGlzdCA9IHJlcXVpcmUgJy4vY29yZS9idWZmZXJsaXN0J1xuU3RyZWFtID0gcmVxdWlyZSAnLi9jb3JlL3N0cmVhbSdcbkJpdHN0cmVhbSA9IHJlcXVpcmUgJy4vY29yZS9iaXRzdHJlYW0nXG5VbmRlcmZsb3dFcnJvciA9IHJlcXVpcmUgJy4vY29yZS91bmRlcmZsb3cnXG5cbmNsYXNzIERlY29kZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJcbiAgICBjb25zdHJ1Y3RvcjogKEBkZW11eGVyLCBAZm9ybWF0KSAtPlxuICAgICAgICBsaXN0ID0gbmV3IEJ1ZmZlckxpc3RcbiAgICAgICAgQHN0cmVhbSA9IG5ldyBTdHJlYW0obGlzdClcbiAgICAgICAgQGJpdHN0cmVhbSA9IG5ldyBCaXRzdHJlYW0oQHN0cmVhbSlcbiAgICAgICAgXG4gICAgICAgIEByZWNlaXZlZEZpbmFsQnVmZmVyID0gZmFsc2VcbiAgICAgICAgQHdhaXRpbmcgPSBmYWxzZVxuICAgICAgICBcbiAgICAgICAgQGRlbXV4ZXIub24gJ2Nvb2tpZScsIChjb29raWUpID0+XG4gICAgICAgICAgICB0cnlcbiAgICAgICAgICAgICAgICBAc2V0Q29va2llIGNvb2tpZVxuICAgICAgICAgICAgY2F0Y2ggZXJyb3JcbiAgICAgICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJvclxuICAgICAgICAgICAgXG4gICAgICAgIEBkZW11eGVyLm9uICdkYXRhJywgKGNodW5rKSA9PlxuICAgICAgICAgICAgbGlzdC5hcHBlbmQgY2h1bmtcbiAgICAgICAgICAgIEBkZWNvZGUoKSBpZiBAd2FpdGluZ1xuICAgICAgICAgICAgXG4gICAgICAgIEBkZW11eGVyLm9uICdlbmQnLCA9PlxuICAgICAgICAgICAgQHJlY2VpdmVkRmluYWxCdWZmZXIgPSB0cnVlXG4gICAgICAgICAgICBAZGVjb2RlKCkgaWYgQHdhaXRpbmdcbiAgICAgICAgICAgIFxuICAgICAgICBAaW5pdCgpXG4gICAgICAgICAgICBcbiAgICBpbml0OiAtPlxuICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIFxuICAgIHNldENvb2tpZTogKGNvb2tpZSkgLT5cbiAgICAgICAgcmV0dXJuXG4gICAgXG4gICAgcmVhZENodW5rOiAtPlxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG4gICAgZGVjb2RlOiAtPlxuICAgICAgICBAd2FpdGluZyA9IG5vdCBAcmVjZWl2ZWRGaW5hbEJ1ZmZlclxuICAgICAgICBvZmZzZXQgPSBAYml0c3RyZWFtLm9mZnNldCgpXG4gICAgICAgIFxuICAgICAgICB0cnlcbiAgICAgICAgICAgIHBhY2tldCA9IEByZWFkQ2h1bmsoKVxuICAgICAgICBjYXRjaCBlcnJvclxuICAgICAgICAgICAgaWYgZXJyb3Igbm90IGluc3RhbmNlb2YgVW5kZXJmbG93RXJyb3JcbiAgICAgICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJvclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICAgICAgXG4gICAgICAgICMgaWYgYSBwYWNrZXQgd2FzIHN1Y2Nlc3NmdWxseSByZWFkLCBlbWl0IGl0XG4gICAgICAgIGlmIHBhY2tldFxuICAgICAgICAgICAgQGVtaXQgJ2RhdGEnLCBwYWNrZXRcbiAgICAgICAgICAgIGlmIEByZWNlaXZlZEZpbmFsQnVmZmVyXG4gICAgICAgICAgICAgIEBlbWl0ICdlbmQnXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgICMgaWYgd2UgaGF2ZW4ndCByZWFjaGVkIHRoZSBlbmQsIGp1bXAgYmFjayBhbmQgdHJ5IGFnYWluIHdoZW4gd2UgaGF2ZSBtb3JlIGRhdGFcbiAgICAgICAgZWxzZSBpZiBub3QgQHJlY2VpdmVkRmluYWxCdWZmZXJcbiAgICAgICAgICAgIEBiaXRzdHJlYW0uc2VlayBvZmZzZXRcbiAgICAgICAgICAgIEB3YWl0aW5nID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgICMgb3RoZXJ3aXNlIHdlJ3ZlIHJlYWNoZWQgdGhlIGVuZFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAZW1pdCAnZW5kJ1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICBcbiAgICBzZWVrOiAodGltZXN0YW1wKSAtPlxuICAgICAgICAjIHVzZSB0aGUgZGVtdXhlciB0byBnZXQgYSBzZWVrIHBvaW50XG4gICAgICAgIHNlZWtQb2ludCA9IEBkZW11eGVyLnNlZWsodGltZXN0YW1wKVxuICAgICAgICBAc3RyZWFtLnNlZWsoc2Vla1BvaW50Lm9mZnNldClcbiAgICAgICAgcmV0dXJuIHNlZWtQb2ludC50aW1lc3RhbXBcbiAgICBcbiAgICBjb2RlY3MgPSB7fVxuICAgIEByZWdpc3RlcjogKGlkLCBkZWNvZGVyKSAtPlxuICAgICAgICBjb2RlY3NbaWRdID0gZGVjb2RlclxuICAgICAgICBcbiAgICBAZmluZDogKGlkKSAtPlxuICAgICAgICByZXR1cm4gY29kZWNzW2lkXSBvciBudWxsXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBEZWNvZGVyXG4iLCJEZWNvZGVyID0gcmVxdWlyZSAnLi4vZGVjb2RlcidcblxuY2xhc3MgTFBDTURlY29kZXIgZXh0ZW5kcyBEZWNvZGVyXG4gICAgRGVjb2Rlci5yZWdpc3RlcignbHBjbScsIExQQ01EZWNvZGVyKVxuICAgIFxuICAgIHJlYWRDaHVuazogPT5cbiAgICAgICAgc3RyZWFtID0gQHN0cmVhbVxuICAgICAgICBsaXR0bGVFbmRpYW4gPSBAZm9ybWF0LmxpdHRsZUVuZGlhblxuICAgICAgICBjaHVua1NpemUgPSBNYXRoLm1pbig0MDk2LCBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSlcbiAgICAgICAgc2FtcGxlcyA9IGNodW5rU2l6ZSAvIChAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC8gOCkgfCAwXG4gICAgICAgIFxuICAgICAgICBpZiBjaHVua1NpemUgPCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC8gOFxuICAgICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgXG4gICAgICAgIGlmIEBmb3JtYXQuZmxvYXRpbmdQb2ludFxuICAgICAgICAgICAgc3dpdGNoIEBmb3JtYXQuYml0c1BlckNoYW5uZWxcbiAgICAgICAgICAgICAgICB3aGVuIDMyXG4gICAgICAgICAgICAgICAgICAgIG91dHB1dCA9IG5ldyBGbG9hdDMyQXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEZsb2F0MzIobGl0dGxlRW5kaWFuKVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiA2NFxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQgPSBuZXcgRmxvYXQ2NEFycmF5KHNhbXBsZXMpXG4gICAgICAgICAgICAgICAgICAgIGZvciBpIGluIFswLi4uc2FtcGxlc10gYnkgMVxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0cHV0W2ldID0gc3RyZWFtLnJlYWRGbG9hdDY0KGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yICdVbnN1cHBvcnRlZCBiaXQgZGVwdGguJ1xuICAgICAgICAgICAgXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN3aXRjaCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsXG4gICAgICAgICAgICAgICAgd2hlbiA4XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dCA9IG5ldyBJbnQ4QXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEludDgoKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHdoZW4gMTZcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0ID0gbmV3IEludDE2QXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEludDE2KGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAyNFxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQgPSBuZXcgSW50MzJBcnJheShzYW1wbGVzKVxuICAgICAgICAgICAgICAgICAgICBmb3IgaSBpbiBbMC4uLnNhbXBsZXNdIGJ5IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dHB1dFtpXSA9IHN0cmVhbS5yZWFkSW50MjQobGl0dGxlRW5kaWFuKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHdoZW4gMzJcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0ID0gbmV3IEludDMyQXJyYXkoc2FtcGxlcylcbiAgICAgICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRwdXRbaV0gPSBzdHJlYW0ucmVhZEludDMyKGxpdHRsZUVuZGlhbilcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgJ1Vuc3VwcG9ydGVkIGJpdCBkZXB0aC4nXG4gICAgICAgIFxuICAgICAgICByZXR1cm4gb3V0cHV0IiwiRGVjb2RlciA9IHJlcXVpcmUgJy4uL2RlY29kZXInXG5cbmNsYXNzIFhMQVdEZWNvZGVyIGV4dGVuZHMgRGVjb2RlclxuICAgIERlY29kZXIucmVnaXN0ZXIoJ3VsYXcnLCBYTEFXRGVjb2RlcilcbiAgICBEZWNvZGVyLnJlZ2lzdGVyKCdhbGF3JywgWExBV0RlY29kZXIpXG4gICAgXG4gICAgU0lHTl9CSVQgICA9IDB4ODBcbiAgICBRVUFOVF9NQVNLID0gMHhmXG4gICAgU0VHX1NISUZUICA9IDRcbiAgICBTRUdfTUFTSyAgID0gMHg3MFxuICAgIEJJQVMgICAgICAgPSAweDg0XG4gICAgXG4gICAgaW5pdDogLT5cbiAgICAgICAgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IDE2XG4gICAgICAgIEB0YWJsZSA9IHRhYmxlID0gbmV3IEludDE2QXJyYXkoMjU2KVxuICAgICAgICBcbiAgICAgICAgaWYgQGZvcm1hdC5mb3JtYXRJRCBpcyAndWxhdydcbiAgICAgICAgICAgIGZvciBpIGluIFswLi4uMjU2XVxuICAgICAgICAgICAgICAgICMgQ29tcGxlbWVudCB0byBvYnRhaW4gbm9ybWFsIHUtbGF3IHZhbHVlLlxuICAgICAgICAgICAgICAgIHZhbCA9IH5pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAjIEV4dHJhY3QgYW5kIGJpYXMgdGhlIHF1YW50aXphdGlvbiBiaXRzLiBUaGVuXG4gICAgICAgICAgICAgICAgIyBzaGlmdCB1cCBieSB0aGUgc2VnbWVudCBudW1iZXIgYW5kIHN1YnRyYWN0IG91dCB0aGUgYmlhcy5cbiAgICAgICAgICAgICAgICB0ID0gKCh2YWwgJiBRVUFOVF9NQVNLKSA8PCAzKSArIEJJQVNcbiAgICAgICAgICAgICAgICB0IDw8PSAodmFsICYgU0VHX01BU0spID4+PiBTRUdfU0hJRlRcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHRhYmxlW2ldID0gaWYgdmFsICYgU0lHTl9CSVQgdGhlbiBCSUFTIC0gdCBlbHNlIHQgLSBCSUFTXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBmb3IgaSBpbiBbMC4uLjI1Nl1cbiAgICAgICAgICAgICAgICB2YWwgPSBpIF4gMHg1NVxuICAgICAgICAgICAgICAgIHQgPSB2YWwgJiBRVUFOVF9NQVNLXG4gICAgICAgICAgICAgICAgc2VnID0gKHZhbCAmIFNFR19NQVNLKSA+Pj4gU0VHX1NISUZUXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgc2VnXG4gICAgICAgICAgICAgICAgICAgIHQgPSAodCArIHQgKyAxICsgMzIpIDw8IChzZWcgKyAyKVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdCA9ICh0ICsgdCArIDEpIDw8IDNcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgdGFibGVbaV0gPSBpZiB2YWwgJiBTSUdOX0JJVCB0aGVuIHQgZWxzZSAtdFxuICAgICAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIFxuICAgIHJlYWRDaHVuazogPT5cbiAgICAgICAge3N0cmVhbSwgdGFibGV9ID0gdGhpc1xuICAgICAgICBcbiAgICAgICAgc2FtcGxlcyA9IE1hdGgubWluKDQwOTYsIEBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSlcbiAgICAgICAgcmV0dXJuIGlmIHNhbXBsZXMgaXMgMFxuICAgICAgICBcbiAgICAgICAgb3V0cHV0ID0gbmV3IEludDE2QXJyYXkoc2FtcGxlcylcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzXSBieSAxXG4gICAgICAgICAgICBvdXRwdXRbaV0gPSB0YWJsZVtzdHJlYW0ucmVhZFVJbnQ4KCldXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIG91dHB1dCIsIkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi9jb3JlL2J1ZmZlcmxpc3QnXG5TdHJlYW0gPSByZXF1aXJlICcuL2NvcmUvc3RyZWFtJ1xuXG5jbGFzcyBEZW11eGVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICBcbiAgICBjb25zdHJ1Y3RvcjogKHNvdXJjZSwgY2h1bmspIC0+XG4gICAgICAgIGxpc3QgPSBuZXcgQnVmZmVyTGlzdFxuICAgICAgICBsaXN0LmFwcGVuZCBjaHVua1xuICAgICAgICBAc3RyZWFtID0gbmV3IFN0cmVhbShsaXN0KVxuICAgICAgICBcbiAgICAgICAgcmVjZWl2ZWQgPSBmYWxzZVxuICAgICAgICBzb3VyY2Uub24gJ2RhdGEnLCAoY2h1bmspID0+XG4gICAgICAgICAgICByZWNlaXZlZCA9IHRydWVcbiAgICAgICAgICAgIGxpc3QuYXBwZW5kIGNodW5rXG4gICAgICAgICAgICB0cnlcbiAgICAgICAgICAgICAgQHJlYWRDaHVuayBjaHVua1xuICAgICAgICAgICAgY2F0Y2ggZVxuICAgICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlXG4gICAgICAgICAgICBcbiAgICAgICAgc291cmNlLm9uICdlcnJvcicsIChlcnIpID0+XG4gICAgICAgICAgICBAZW1pdCAnZXJyb3InLCBlcnJcbiAgICAgICAgICAgIFxuICAgICAgICBzb3VyY2Uub24gJ2VuZCcsID0+XG4gICAgICAgICAgICAjIGlmIHRoZXJlIHdhcyBvbmx5IG9uZSBjaHVuayByZWNlaXZlZCwgcmVhZCBpdFxuICAgICAgICAgICAgQHJlYWRDaHVuayBjaHVuayB1bmxlc3MgcmVjZWl2ZWRcbiAgICAgICAgICAgIEBlbWl0ICdlbmQnXG4gICAgICAgIFxuICAgICAgICBAc2Vla1BvaW50cyA9IFtdXG4gICAgICAgIEBpbml0KClcbiAgICAgICAgICAgIFxuICAgIGluaXQ6IC0+XG4gICAgICAgIHJldHVyblxuICAgICAgICAgICAgXG4gICAgcmVhZENodW5rOiAoY2h1bmspIC0+XG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICBhZGRTZWVrUG9pbnQ6IChvZmZzZXQsIHRpbWVzdGFtcCkgLT5cbiAgICAgICAgaW5kZXggPSBAc2VhcmNoVGltZXN0YW1wIHRpbWVzdGFtcFxuICAgICAgICBAc2Vla1BvaW50cy5zcGxpY2UgaW5kZXgsIDAsIFxuICAgICAgICAgICAgb2Zmc2V0OiBvZmZzZXRcbiAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wXG4gICAgICAgIFxuICAgIHNlYXJjaFRpbWVzdGFtcDogKHRpbWVzdGFtcCwgYmFja3dhcmQpIC0+XG4gICAgICAgIGxvdyA9IDBcbiAgICAgICAgaGlnaCA9IEBzZWVrUG9pbnRzLmxlbmd0aFxuICAgICAgICBcbiAgICAgICAgIyBvcHRpbWl6ZSBhcHBlbmRpbmcgZW50cmllc1xuICAgICAgICBpZiBoaWdoID4gMCBhbmQgQHNlZWtQb2ludHNbaGlnaCAtIDFdLnRpbWVzdGFtcCA8IHRpbWVzdGFtcFxuICAgICAgICAgICAgcmV0dXJuIGhpZ2hcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIGxvdyA8IGhpZ2hcbiAgICAgICAgICAgIG1pZCA9IChsb3cgKyBoaWdoKSA+PiAxXG4gICAgICAgICAgICB0aW1lID0gQHNlZWtQb2ludHNbbWlkXS50aW1lc3RhbXBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgdGltZSA8IHRpbWVzdGFtcFxuICAgICAgICAgICAgICAgIGxvdyA9IG1pZCArIDFcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGVsc2UgaWYgdGltZSA+PSB0aW1lc3RhbXBcbiAgICAgICAgICAgICAgICBoaWdoID0gbWlkXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIGlmIGhpZ2ggPiBAc2Vla1BvaW50cy5sZW5ndGhcbiAgICAgICAgICAgIGhpZ2ggPSBAc2Vla1BvaW50cy5sZW5ndGhcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm4gaGlnaFxuICAgICAgICBcbiAgICBzZWVrOiAodGltZXN0YW1wKSAtPlxuICAgICAgICBpZiBAZm9ybWF0IGFuZCBAZm9ybWF0LmZyYW1lc1BlclBhY2tldCA+IDAgYW5kIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgPiAwXG4gICAgICAgICAgICBzZWVrUG9pbnQgPVxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZXN0YW1wXG4gICAgICAgICAgICAgICAgb2Zmc2V0OiBAZm9ybWF0LmJ5dGVzUGVyUGFja2V0ICogdGltZXN0YW1wIC8gQGZvcm1hdC5mcmFtZXNQZXJQYWNrZXRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBzZWVrUG9pbnRcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaW5kZXggPSBAc2VhcmNoVGltZXN0YW1wIHRpbWVzdGFtcFxuICAgICAgICAgICAgcmV0dXJuIEBzZWVrUG9pbnRzW2luZGV4XVxuICAgICAgICBcbiAgICBmb3JtYXRzID0gW11cbiAgICBAcmVnaXN0ZXI6IChkZW11eGVyKSAtPlxuICAgICAgICBmb3JtYXRzLnB1c2ggZGVtdXhlclxuICAgICAgICAgICAgXG4gICAgQGZpbmQ6IChidWZmZXIpIC0+XG4gICAgICAgIHN0cmVhbSA9IFN0cmVhbS5mcm9tQnVmZmVyKGJ1ZmZlcikgICAgICAgIFxuICAgICAgICBmb3IgZm9ybWF0IGluIGZvcm1hdHNcbiAgICAgICAgICAgIG9mZnNldCA9IHN0cmVhbS5vZmZzZXRcbiAgICAgICAgICAgIHRyeVxuICAgICAgICAgICAgICAgICByZXR1cm4gZm9ybWF0IGlmIGZvcm1hdC5wcm9iZShzdHJlYW0pXG4gICAgICAgICAgICBjYXRjaCBlXG4gICAgICAgICAgICAgICAgIyBhbiB1bmRlcmZsb3cgb3Igb3RoZXIgZXJyb3Igb2NjdXJyZWRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHN0cmVhbS5zZWVrKG9mZnNldClcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gRGVtdXhlclxuIiwiRGVtdXhlciA9IHJlcXVpcmUgJy4uL2RlbXV4ZXInXG5cbmNsYXNzIEFJRkZEZW11eGVyIGV4dGVuZHMgRGVtdXhlclxuICAgIERlbXV4ZXIucmVnaXN0ZXIoQUlGRkRlbXV4ZXIpXG4gICAgXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gYnVmZmVyLnBlZWtTdHJpbmcoMCwgNCkgaXMgJ0ZPUk0nICYmIFxuICAgICAgICAgICAgICAgYnVmZmVyLnBlZWtTdHJpbmcoOCwgNCkgaW4gWydBSUZGJywgJ0FJRkMnXVxuICAgICAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIGlmIG5vdCBAcmVhZFN0YXJ0IGFuZCBAc3RyZWFtLmF2YWlsYWJsZSgxMilcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdGT1JNJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBBSUZGLidcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIEBmaWxlU2l6ZSA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICBAZmlsZVR5cGUgPSBAc3RyZWFtLnJlYWRTdHJpbmcoNClcbiAgICAgICAgICAgIEByZWFkU3RhcnQgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEBmaWxlVHlwZSBub3QgaW4gWydBSUZGJywgJ0FJRkMnXVxuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBBSUZGLidcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIEBzdHJlYW0uYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICBpZiBub3QgQHJlYWRIZWFkZXJzIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg4KVxuICAgICAgICAgICAgICAgIEB0eXBlID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgICAgICAgICAgQGxlbiA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBzd2l0Y2ggQHR5cGVcbiAgICAgICAgICAgICAgICB3aGVuICdDT01NJ1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKEBsZW4pXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBAZm9ybWF0ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1hdElEOiAnbHBjbSdcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5uZWxzUGVyRnJhbWU6IEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVDb3VudDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIGJpdHNQZXJDaGFubmVsOiBAc3RyZWFtLnJlYWRVSW50MTYoKVxuICAgICAgICAgICAgICAgICAgICAgICAgc2FtcGxlUmF0ZTogQHN0cmVhbS5yZWFkRmxvYXQ4MCgpXG4gICAgICAgICAgICAgICAgICAgICAgICBmcmFtZXNQZXJQYWNrZXQ6IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGZsb2F0aW5nUG9pbnQ6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGZvcm1hdC5ieXRlc1BlclBhY2tldCA9IChAZm9ybWF0LmJpdHNQZXJDaGFubmVsIC8gOCkgKiBAZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWVcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGlmIEBmaWxlVHlwZSBpcyAnQUlGQydcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1hdCA9IEBzdHJlYW0ucmVhZFN0cmluZyg0KVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBAZm9ybWF0LmxpdHRsZUVuZGlhbiA9IGZvcm1hdCBpcyAnc293dCcgYW5kIEBmb3JtYXQuYml0c1BlckNoYW5uZWwgPiA4XG4gICAgICAgICAgICAgICAgICAgICAgICBAZm9ybWF0LmZsb2F0aW5nUG9pbnQgPSBmb3JtYXQgaW4gWydmbDMyJywgJ2ZsNjQnXVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtYXQgPSAnbHBjbScgaWYgZm9ybWF0IGluIFsndHdvcycsICdzb3d0JywgJ2ZsMzInLCAnZmw2NCcsICdOT05FJ11cbiAgICAgICAgICAgICAgICAgICAgICAgIEBmb3JtYXQuZm9ybWF0SUQgPSBmb3JtYXRcbiAgICAgICAgICAgICAgICAgICAgICAgIEBsZW4gLT0gNFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gMTgpXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdmb3JtYXQnLCBAZm9ybWF0XG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkdXJhdGlvbicsIEBmb3JtYXQuc2FtcGxlQ291bnQgLyBAZm9ybWF0LnNhbXBsZVJhdGUgKiAxMDAwIHwgMFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB3aGVuICdTU05EJ1xuICAgICAgICAgICAgICAgICAgICB1bmxlc3MgQHJlYWRTU05ESGVhZGVyIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg0KVxuICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0ID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIHNraXAgYmxvY2sgc2l6ZVxuICAgICAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKG9mZnNldCkgIyBza2lwIHRvIGRhdGFcbiAgICAgICAgICAgICAgICAgICAgICAgIEByZWFkU1NOREhlYWRlciA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBidWZmZXIgPSBAc3RyZWFtLnJlYWRTaW5nbGVCdWZmZXIoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgQGxlbiAtPSBidWZmZXIubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIEByZWFkSGVhZGVycyA9IEBsZW4gPiAwXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmZmVyXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShAbGVuKVxuICAgICAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2UgdW5sZXNzIEB0eXBlIGlzICdTU05EJ1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiIsIkRlbXV4ZXIgPSByZXF1aXJlICcuLi9kZW11eGVyJ1xuXG5jbGFzcyBBVURlbXV4ZXIgZXh0ZW5kcyBEZW11eGVyXG4gICAgRGVtdXhlci5yZWdpc3RlcihBVURlbXV4ZXIpXG4gICAgXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gYnVmZmVyLnBlZWtTdHJpbmcoMCwgNCkgaXMgJy5zbmQnXG4gICAgICAgIFxuICAgIGJwcyA9IFs4LCA4LCAxNiwgMjQsIDMyLCAzMiwgNjRdXG4gICAgYnBzWzI2XSA9IDhcbiAgICBcbiAgICBmb3JtYXRzID0gXG4gICAgICAgIDE6ICd1bGF3J1xuICAgICAgICAyNzogJ2FsYXcnXG4gICAgICAgIFxuICAgIHJlYWRDaHVuazogLT5cbiAgICAgICAgaWYgbm90IEByZWFkSGVhZGVyIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSgyNClcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICcuc25kJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBBVSBmaWxlLidcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHNpemUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgZGF0YVNpemUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgZW5jb2RpbmcgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBAZm9ybWF0ID0gXG4gICAgICAgICAgICAgICAgZm9ybWF0SUQ6IGZvcm1hdHNbZW5jb2RpbmddIG9yICdscGNtJ1xuICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbjogZmFsc2VcbiAgICAgICAgICAgICAgICBmbG9hdGluZ1BvaW50OiBlbmNvZGluZyBpbiBbNiwgN11cbiAgICAgICAgICAgICAgICBiaXRzUGVyQ2hhbm5lbDogYnBzW2VuY29kaW5nIC0gMV1cbiAgICAgICAgICAgICAgICBzYW1wbGVSYXRlOiBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIGNoYW5uZWxzUGVyRnJhbWU6IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgZnJhbWVzUGVyUGFja2V0OiAxXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIG5vdCBAZm9ybWF0LmJpdHNQZXJDaGFubmVsP1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnVW5zdXBwb3J0ZWQgZW5jb2RpbmcgaW4gQVUgZmlsZS4nXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgPSAoQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAvIDgpICogQGZvcm1hdC5jaGFubmVsc1BlckZyYW1lXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIGRhdGFTaXplIGlzbnQgMHhmZmZmZmZmZlxuICAgICAgICAgICAgICAgIGJ5dGVzID0gQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAvIDhcbiAgICAgICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBkYXRhU2l6ZSAvIGJ5dGVzIC8gQGZvcm1hdC5jaGFubmVsc1BlckZyYW1lIC8gQGZvcm1hdC5zYW1wbGVSYXRlICogMTAwMCB8IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgQGVtaXQgJ2Zvcm1hdCcsIEBmb3JtYXRcbiAgICAgICAgICAgIEByZWFkSGVhZGVyID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgIGlmIEByZWFkSGVhZGVyXG4gICAgICAgICAgICB3aGlsZSBAc3RyZWFtLmF2YWlsYWJsZSgxKVxuICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgQHN0cmVhbS5yZWFkU2luZ2xlQnVmZmVyKEBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIiwiRGVtdXhlciA9IHJlcXVpcmUgJy4uL2RlbXV4ZXInXG5NNEFEZW11eGVyID0gcmVxdWlyZSAnLi9tNGEnXG5cbmNsYXNzIENBRkRlbXV4ZXIgZXh0ZW5kcyBEZW11eGVyXG4gICAgRGVtdXhlci5yZWdpc3RlcihDQUZEZW11eGVyKVxuICAgIFxuICAgIEBwcm9iZTogKGJ1ZmZlcikgLT5cbiAgICAgICAgcmV0dXJuIGJ1ZmZlci5wZWVrU3RyaW5nKDAsIDQpIGlzICdjYWZmJ1xuICAgICAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIGlmIG5vdCBAZm9ybWF0IGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg2NCkgIyBOdW1iZXIgb3V0IG9mIG15IGJlaGluZFxuICAgICAgICAgICAgaWYgQHN0cmVhbS5yZWFkU3RyaW5nKDQpIGlzbnQgJ2NhZmYnXG4gICAgICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsIFwiSW52YWxpZCBDQUYsIGRvZXMgbm90IGJlZ2luIHdpdGggJ2NhZmYnXCJcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICMgc2tpcCB2ZXJzaW9uIGFuZCBmbGFnc1xuICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdkZXNjJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCBcIkludmFsaWQgQ0FGLCAnY2FmZicgaXMgbm90IGZvbGxvd2VkIGJ5ICdkZXNjJ1wiXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB1bmxlc3MgQHN0cmVhbS5yZWFkVUludDMyKCkgaXMgMCBhbmQgQHN0cmVhbS5yZWFkVUludDMyKCkgaXMgMzJcbiAgICAgICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgXCJJbnZhbGlkICdkZXNjJyBzaXplLCBzaG91bGQgYmUgMzJcIlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQGZvcm1hdCA9IHt9XG4gICAgICAgICAgICBAZm9ybWF0LnNhbXBsZVJhdGUgPSBAc3RyZWFtLnJlYWRGbG9hdDY0KClcbiAgICAgICAgICAgIEBmb3JtYXQuZm9ybWF0SUQgPSBAc3RyZWFtLnJlYWRTdHJpbmcoNClcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxhZ3MgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgaWYgQGZvcm1hdC5mb3JtYXRJRCBpcyAnbHBjbSdcbiAgICAgICAgICAgICAgICBAZm9ybWF0LmZsb2F0aW5nUG9pbnQgPSBCb29sZWFuKGZsYWdzICYgMSlcbiAgICAgICAgICAgICAgICBAZm9ybWF0LmxpdHRsZUVuZGlhbiA9IEJvb2xlYW4oZmxhZ3MgJiAyKVxuICAgICAgICAgICAgIFxuICAgICAgICAgICAgQGZvcm1hdC5ieXRlc1BlclBhY2tldCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICBAZm9ybWF0LmZyYW1lc1BlclBhY2tldCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICBAZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBAZW1pdCAnZm9ybWF0JywgQGZvcm1hdFxuICAgICAgICAgICAgXG4gICAgICAgIHdoaWxlIEBzdHJlYW0uYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICB1bmxlc3MgQGhlYWRlckNhY2hlXG4gICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID1cbiAgICAgICAgICAgICAgICAgICAgdHlwZTogQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgICAgICAgICAgICAgIG92ZXJzaXplOiBAc3RyZWFtLnJlYWRVSW50MzIoKSBpc250IDBcbiAgICAgICAgICAgICAgICAgICAgc2l6ZTogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiBAaGVhZGVyQ2FjaGUub3ZlcnNpemVcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsIFwiSG9seSBTaGl0LCBhbiBvdmVyc2l6ZWQgZmlsZSwgbm90IHN1cHBvcnRlZCBpbiBKU1wiXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHN3aXRjaCBAaGVhZGVyQ2FjaGUudHlwZVxuICAgICAgICAgICAgICAgIHdoZW4gJ2t1a2knXG4gICAgICAgICAgICAgICAgICAgIGlmIEBzdHJlYW0uYXZhaWxhYmxlKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgQGZvcm1hdC5mb3JtYXRJRCBpcyAnYWFjICcgIyB2YXJpYXRpb25zIG5lZWRlZD9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQgPSBAc3RyZWFtLm9mZnNldCArIEBoZWFkZXJDYWNoZS5zaXplXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgY29va2llID0gTTRBRGVtdXhlci5yZWFkRXNkcyhAc3RyZWFtKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBAZW1pdCAnY29va2llJywgY29va2llXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uc2VlayBvZmZzZXQgIyBza2lwIGV4dHJhIGdhcmJhZ2VcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyID0gQHN0cmVhbS5yZWFkQnVmZmVyKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBlbWl0ICdjb29raWUnLCBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAncGFrdCdcbiAgICAgICAgICAgICAgICAgICAgaWYgQHN0cmVhbS5hdmFpbGFibGUoQGhlYWRlckNhY2hlLnNpemUpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiBAc3RyZWFtLnJlYWRVSW50MzIoKSBpc250IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgJ1NpemVzIGdyZWF0ZXIgdGhhbiAzMiBiaXRzIGFyZSBub3Qgc3VwcG9ydGVkLidcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIEBudW1QYWNrZXRzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgQHN0cmVhbS5yZWFkVUludDMyKCkgaXNudCAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsICdTaXplcyBncmVhdGVyIHRoYW4gMzIgYml0cyBhcmUgbm90IHN1cHBvcnRlZC4nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBAbnVtRnJhbWVzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIEBwcmltaW5nRnJhbWVzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIEByZW1haW5kZXJGcmFtZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAbnVtRnJhbWVzIC8gQGZvcm1hdC5zYW1wbGVSYXRlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzZW50RHVyYXRpb24gPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ5dGVPZmZzZXQgPSAwXG4gICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVPZmZzZXQgPSAwXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgaSBpbiBbMC4uLkBudW1QYWNrZXRzXSBieSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgQGFkZFNlZWtQb2ludCBieXRlT2Zmc2V0LCBzYW1wbGVPZmZzZXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBieXRlT2Zmc2V0ICs9IEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgb3IgTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oQHN0cmVhbSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzYW1wbGVPZmZzZXQgKz0gQGZvcm1hdC5mcmFtZXNQZXJQYWNrZXQgb3IgTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oQHN0cmVhbSlcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAnaW5mbydcbiAgICAgICAgICAgICAgICAgICAgZW50cmllcyA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhID0ge31cbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGZvciBpIGluIFswLi4uZW50cmllc11cbiAgICAgICAgICAgICAgICAgICAgICAgICMgbnVsbCB0ZXJtaW5hdGVkIHN0cmluZ3NcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IEBzdHJlYW0ucmVhZFN0cmluZyhudWxsKVxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBAc3RyZWFtLnJlYWRTdHJpbmcobnVsbCkgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhW2tleV0gPSB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGVtaXQgJ21ldGFkYXRhJywgbWV0YWRhdGFcbiAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB3aGVuICdkYXRhJ1xuICAgICAgICAgICAgICAgICAgICB1bmxlc3MgQHNlbnRGaXJzdERhdGFDaHVua1xuICAgICAgICAgICAgICAgICAgICAgICAgIyBza2lwIGVkaXQgY291bnRcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KVxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlLnNpemUgLT0gNFxuXG4gICAgICAgICAgICAgICAgICAgICAgICAjIGNhbGN1bGF0ZSB0aGUgZHVyYXRpb24gYmFzZWQgb24gYnl0ZXMgcGVyIHBhY2tldCBpZiBubyBwYWNrZXQgdGFibGVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXQgaXNudCAwIGFuZCBub3QgQHNlbnREdXJhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEBudW1GcmFtZXMgPSBAaGVhZGVyQ2FjaGUuc2l6ZSAvIEBmb3JtYXQuYnl0ZXNQZXJQYWNrZXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAbnVtRnJhbWVzIC8gQGZvcm1hdC5zYW1wbGVSYXRlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIEBzZW50Rmlyc3REYXRhQ2h1bmsgPSB0cnVlXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGJ1ZmZlciA9IEBzdHJlYW0ucmVhZFNpbmdsZUJ1ZmZlcihAaGVhZGVyQ2FjaGUuc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlLnNpemUgLT0gYnVmZmVyLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICBAZW1pdCAnZGF0YScsIGJ1ZmZlclxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgQGhlYWRlckNhY2hlLnNpemUgPD0gMFxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGlmIEBzdHJlYW0uYXZhaWxhYmxlKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBoZWFkZXJDYWNoZS5zaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgQGhlYWRlckNhY2hlID0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiIsIkRlbXV4ZXIgPSByZXF1aXJlICcuLi9kZW11eGVyJ1xuXG5jbGFzcyBNNEFEZW11eGVyIGV4dGVuZHMgRGVtdXhlclxuICAgIERlbXV4ZXIucmVnaXN0ZXIoTTRBRGVtdXhlcilcbiAgICBcbiAgICAjIGNvbW1vbiBmaWxlIHR5cGUgaWRlbnRpZmllcnNcbiAgICAjIHNlZSBodHRwOi8vbXA0cmEub3JnL2ZpbGV0eXBlLmh0bWwgZm9yIGEgY29tcGxldGUgbGlzdFxuICAgIFRZUEVTID0gWydNNEEgJywgJ000UCAnLCAnTTRCICcsICdNNFYgJywgJ2lzb20nLCAnbXA0MicsICdxdCAgJ11cbiAgICBcbiAgICBAcHJvYmU6IChidWZmZXIpIC0+XG4gICAgICAgIHJldHVybiBidWZmZXIucGVla1N0cmluZyg0LCA0KSBpcyAnZnR5cCcgYW5kXG4gICAgICAgICAgICAgICBidWZmZXIucGVla1N0cmluZyg4LCA0KSBpbiBUWVBFU1xuICAgICAgICBcbiAgICBpbml0OiAtPlxuICAgICAgICAjIGN1cnJlbnQgYXRvbSBoZWlyYXJjaHkgc3RhY2tzXG4gICAgICAgIEBhdG9tcyA9IFtdXG4gICAgICAgIEBvZmZzZXRzID0gW11cbiAgICAgICAgXG4gICAgICAgICMgbTRhIGZpbGVzIGNhbiBoYXZlIG11bHRpcGxlIHRyYWNrc1xuICAgICAgICBAdHJhY2sgPSBudWxsXG4gICAgICAgIEB0cmFja3MgPSBbXVxuICAgICAgICBcbiAgICAjIGxvb2t1cCB0YWJsZSBmb3IgYXRvbSBoYW5kbGVyc1xuICAgIGF0b21zID0ge31cbiAgICBcbiAgICAjIGxvb2t1cCB0YWJsZSBvZiBjb250YWluZXIgYXRvbSBuYW1lc1xuICAgIGNvbnRhaW5lcnMgPSB7fVxuICAgIFxuICAgICMgZGVjbGFyZSBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgZm9yIHBhcnNpbmcgYSBnaXZlbiBhdG9tIG5hbWVcbiAgICBhdG9tID0gKG5hbWUsIGZuKSAtPiAgICAgICAgXG4gICAgICAgIGMgPSBbXVxuICAgICAgICBmb3IgY29udGFpbmVyIGluIG5hbWUuc3BsaXQoJy4nKS5zbGljZSgwLCAtMSlcbiAgICAgICAgICAgIGMucHVzaCBjb250YWluZXJcbiAgICAgICAgICAgIGNvbnRhaW5lcnNbYy5qb2luKCcuJyldID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgICAgIGF0b21zW25hbWVdID89IHt9XG4gICAgICAgIGF0b21zW25hbWVdLmZuID0gZm5cbiAgICAgICAgXG4gICAgIyBkZWNsYXJlIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGFmdGVyIHBhcnNpbmcgb2YgYW4gYXRvbSBhbmQgYWxsIHN1Yi1hdG9tcyBoYXMgY29tcGxldGVkXG4gICAgYWZ0ZXIgPSAobmFtZSwgZm4pIC0+XG4gICAgICAgIGF0b21zW25hbWVdID89IHt9XG4gICAgICAgIGF0b21zW25hbWVdLmFmdGVyID0gZm5cbiAgICAgICAgXG4gICAgcmVhZENodW5rOiAtPlxuICAgICAgICBAYnJlYWsgPSBmYWxzZVxuICAgICAgICBcbiAgICAgICAgd2hpbGUgQHN0cmVhbS5hdmFpbGFibGUoMSkgYW5kIG5vdCBAYnJlYWtcbiAgICAgICAgICAgICMgaWYgd2UncmUgcmVhZHkgdG8gcmVhZCBhIG5ldyBhdG9tLCBhZGQgaXQgdG8gdGhlIHN0YWNrXG4gICAgICAgICAgICBpZiBub3QgQHJlYWRIZWFkZXJzXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZSg4KVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIEBsZW4gPSBAc3RyZWFtLnJlYWRVSW50MzIoKSAtIDhcbiAgICAgICAgICAgICAgICBAdHlwZSA9IEBzdHJlYW0ucmVhZFN0cmluZyg0KVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnRpbnVlIGlmIEBsZW4gaXMgMFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIEBhdG9tcy5wdXNoIEB0eXBlXG4gICAgICAgICAgICAgICAgQG9mZnNldHMucHVzaCBAc3RyZWFtLm9mZnNldCArIEBsZW5cbiAgICAgICAgICAgICAgICBAcmVhZEhlYWRlcnMgPSB0cnVlXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAjIGZpbmQgYSBoYW5kbGVyIGZvciB0aGUgY3VycmVudCBhdG9tIGhlaXJhcmNoeVxuICAgICAgICAgICAgcGF0aCA9IEBhdG9tcy5qb2luICcuJyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGhhbmRsZXIgPSBhdG9tc1twYXRoXVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiBoYW5kbGVyPy5mblxuICAgICAgICAgICAgICAgICMgd2FpdCB1bnRpbCB3ZSBoYXZlIGVub3VnaCBkYXRhLCB1bmxlc3MgdGhpcyBpcyB0aGUgbWRhdCBhdG9tXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShAbGVuKSBvciBwYXRoIGlzICdtZGF0J1xuXG4gICAgICAgICAgICAgICAgIyBjYWxsIHRoZSBwYXJzZXIgZm9yIHRoZSBhdG9tIHR5cGVcbiAgICAgICAgICAgICAgICBoYW5kbGVyLmZuLmNhbGwodGhpcylcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAjIGNoZWNrIGlmIHRoaXMgYXRvbSBjYW4gY29udGFpbiBzdWItYXRvbXNcbiAgICAgICAgICAgICAgICBpZiBwYXRoIG9mIGNvbnRhaW5lcnNcbiAgICAgICAgICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAjIGhhbmRsZSBjb250YWluZXIgYXRvbXNcbiAgICAgICAgICAgIGVsc2UgaWYgcGF0aCBvZiBjb250YWluZXJzXG4gICAgICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2VcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICMgdW5rbm93biBhdG9tXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgIyB3YWl0IHVudGlsIHdlIGhhdmUgZW5vdWdoIGRhdGFcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKEBsZW4pXG4gICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBsZW4pXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAjIHBvcCBjb21wbGV0ZWQgaXRlbXMgZnJvbSB0aGUgc3RhY2tcbiAgICAgICAgICAgIHdoaWxlIEBzdHJlYW0ub2Zmc2V0ID49IEBvZmZzZXRzW0BvZmZzZXRzLmxlbmd0aCAtIDFdXG4gICAgICAgICAgICAgICAgIyBjYWxsIGFmdGVyIGhhbmRsZXJcbiAgICAgICAgICAgICAgICBoYW5kbGVyID0gYXRvbXNbQGF0b21zLmpvaW4gJy4nXVxuICAgICAgICAgICAgICAgIGlmIGhhbmRsZXI/LmFmdGVyXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXIuYWZ0ZXIuY2FsbCh0aGlzKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHR5cGUgPSBAYXRvbXMucG9wKClcbiAgICAgICAgICAgICAgICBAb2Zmc2V0cy5wb3AoKVxuICAgICAgICAgICAgICAgIEByZWFkSGVhZGVycyA9IGZhbHNlXG4gICAgICAgICAgICAgICAgXG4gICAgYXRvbSAnZnR5cCcsIC0+XG4gICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBub3QgaW4gVFlQRVNcbiAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnTm90IGEgdmFsaWQgTTRBIGZpbGUuJ1xuICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBsZW4gLSA0KVxuICAgIFxuICAgIGF0b20gJ21vb3YudHJhaycsIC0+XG4gICAgICAgIEB0cmFjayA9IHt9XG4gICAgICAgIEB0cmFja3MucHVzaCBAdHJhY2tcbiAgICAgICAgXG4gICAgYXRvbSAnbW9vdi50cmFrLnRraGQnLCAtPlxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyB2ZXJzaW9uIGFuZCBmbGFnc1xuICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDgpICMgY3JlYXRpb24gYW5kIG1vZGlmaWNhdGlvbiB0aW1lXG4gICAgICAgIEB0cmFjay5pZCA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoQGxlbiAtIDE2KVxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5oZGxyJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIGNvbXBvbmVudCB0eXBlXG4gICAgICAgIEB0cmFjay50eXBlID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMTIpICMgY29tcG9uZW50IG1hbnVmYWN0dXJlciwgZmxhZ3MsIGFuZCBtYXNrXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gMjQpICMgY29tcG9uZW50IG5hbWVcbiAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5tZGhkJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDgpICMgY3JlYXRpb24gYW5kIG1vZGlmaWNhdGlvbiBkYXRlc1xuICAgICAgICBcbiAgICAgICAgQHRyYWNrLnRpbWVTY2FsZSA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIEB0cmFjay5kdXJhdGlvbiA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyBsYW5ndWFnZSBhbmQgcXVhbGl0eVxuICAgICAgICBcbiAgICAjIGNvcnJlY3Rpb25zIHRvIGJpdHMgcGVyIGNoYW5uZWwsIGJhc2Ugb24gZm9ybWF0SURcbiAgICAjIChmZm1wZWcgYXBwZWFycyB0byBhbHdheXMgZW5jb2RlIHRoZSBiaXRzUGVyQ2hhbm5lbCBhcyAxNilcbiAgICBCSVRTX1BFUl9DSEFOTkVMID0gXG4gICAgICAgIHVsYXc6IDhcbiAgICAgICAgYWxhdzogOFxuICAgICAgICBpbjI0OiAyNFxuICAgICAgICBpbjMyOiAzMlxuICAgICAgICBmbDMyOiAzMlxuICAgICAgICBmbDY0OiA2NFxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzZCcsIC0+XG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIHZlcnNpb24gYW5kIGZsYWdzXG4gICAgICAgIFxuICAgICAgICBudW1FbnRyaWVzID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgXG4gICAgICAgICMganVzdCBpZ25vcmUgdGhlIHJlc3Qgb2YgdGhlIGF0b20gaWYgdGhpcyBpc24ndCBhbiBhdWRpbyB0cmFja1xuICAgICAgICBpZiBAdHJhY2sudHlwZSBpc250ICdzb3VuJ1xuICAgICAgICAgICAgcmV0dXJuIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gOClcbiAgICAgICAgXG4gICAgICAgIGlmIG51bUVudHJpZXMgaXNudCAxXG4gICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgXCJPbmx5IGV4cGVjdGluZyBvbmUgZW50cnkgaW4gc2FtcGxlIGRlc2NyaXB0aW9uIGF0b20hXCJcbiAgICAgICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyBzaXplXG4gICAgICAgIFxuICAgICAgICBmb3JtYXQgPSBAdHJhY2suZm9ybWF0ID0ge31cbiAgICAgICAgZm9ybWF0LmZvcm1hdElEID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgIFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNikgIyByZXNlcnZlZFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMikgIyBkYXRhIHJlZmVyZW5jZSBpbmRleFxuICAgICAgICBcbiAgICAgICAgdmVyc2lvbiA9IEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg2KSAjIHNraXAgcmV2aXNpb24gbGV2ZWwgYW5kIHZlbmRvclxuICAgICAgICBcbiAgICAgICAgZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWUgPSBAc3RyZWFtLnJlYWRVSW50MTYoKVxuICAgICAgICBmb3JtYXQuYml0c1BlckNoYW5uZWwgPSBAc3RyZWFtLnJlYWRVSW50MTYoKVxuICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgc2tpcCBjb21wcmVzc2lvbiBpZCBhbmQgcGFja2V0IHNpemVcbiAgICAgICAgXG4gICAgICAgIGZvcm1hdC5zYW1wbGVSYXRlID0gQHN0cmVhbS5yZWFkVUludDE2KClcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDIpXG4gICAgICAgIFxuICAgICAgICBpZiB2ZXJzaW9uIGlzIDFcbiAgICAgICAgICAgIGZvcm1hdC5mcmFtZXNQZXJQYWNrZXQgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgYnl0ZXMgcGVyIHBhY2tldFxuICAgICAgICAgICAgZm9ybWF0LmJ5dGVzUGVyRnJhbWUgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgYnl0ZXMgcGVyIHNhbXBsZVxuICAgICAgICAgICAgXG4gICAgICAgIGVsc2UgaWYgdmVyc2lvbiBpc250IDBcbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsICdVbmtub3duIHZlcnNpb24gaW4gc3RzZCBhdG9tJ1xuICAgICAgICAgICAgXG4gICAgICAgIGlmIEJJVFNfUEVSX0NIQU5ORUxbZm9ybWF0LmZvcm1hdElEXT9cbiAgICAgICAgICAgIGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IEJJVFNfUEVSX0NIQU5ORUxbZm9ybWF0LmZvcm1hdElEXVxuICAgICAgICAgICAgXG4gICAgICAgIGZvcm1hdC5mbG9hdGluZ1BvaW50ID0gZm9ybWF0LmZvcm1hdElEIGluIFsnZmwzMicsICdmbDY0J11cbiAgICAgICAgZm9ybWF0LmxpdHRsZUVuZGlhbiA9IGZvcm1hdC5mb3JtYXRJRCBpcyAnc293dCcgYW5kIGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA+IDhcbiAgICAgICAgXG4gICAgICAgIGlmIGZvcm1hdC5mb3JtYXRJRCBpbiBbJ3R3b3MnLCAnc293dCcsICdpbjI0JywgJ2luMzInLCAnZmwzMicsICdmbDY0JywgJ3JhdyAnLCAnTk9ORSddXG4gICAgICAgICAgICBmb3JtYXQuZm9ybWF0SUQgPSAnbHBjbSdcbiAgICAgICAgXG4gICAgYXRvbSAnbW9vdi50cmFrLm1kaWEubWluZi5zdGJsLnN0c2QuYWxhYycsIC0+XG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KVxuICAgICAgICBAdHJhY2suY29va2llID0gQHN0cmVhbS5yZWFkQnVmZmVyKEBsZW4gLSA0KVxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzZC5lc2RzJywgLT5cbiAgICAgICAgb2Zmc2V0ID0gQHN0cmVhbS5vZmZzZXQgKyBAbGVuXG4gICAgICAgIEB0cmFjay5jb29raWUgPSBNNEFEZW11eGVyLnJlYWRFc2RzIEBzdHJlYW1cbiAgICAgICAgQHN0cmVhbS5zZWVrIG9mZnNldCAjIHNraXAgZ2FyYmFnZSBhdCB0aGUgZW5kIFxuICAgICAgICBcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzZC53YXZlLmVuZGEnLCAtPlxuICAgICAgICBAdHJhY2suZm9ybWF0LmxpdHRsZUVuZGlhbiA9ICEhQHN0cmVhbS5yZWFkVUludDE2KClcbiAgICAgICAgXG4gICAgIyByZWFkcyBhIHZhcmlhYmxlIGxlbmd0aCBpbnRlZ2VyXG4gICAgQHJlYWREZXNjckxlbjogKHN0cmVhbSkgLT5cbiAgICAgICAgbGVuID0gMFxuICAgICAgICBjb3VudCA9IDRcblxuICAgICAgICB3aGlsZSBjb3VudC0tXG4gICAgICAgICAgICBjID0gc3RyZWFtLnJlYWRVSW50OCgpXG4gICAgICAgICAgICBsZW4gPSAobGVuIDw8IDcpIHwgKGMgJiAweDdmKVxuICAgICAgICAgICAgYnJlYWsgdW5sZXNzIGMgJiAweDgwXG5cbiAgICAgICAgcmV0dXJuIGxlblxuICAgICAgICBcbiAgICBAcmVhZEVzZHM6IChzdHJlYW0pIC0+XG4gICAgICAgIHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIHRhZyA9IHN0cmVhbS5yZWFkVUludDgoKVxuICAgICAgICBsZW4gPSBNNEFEZW11eGVyLnJlYWREZXNjckxlbihzdHJlYW0pXG5cbiAgICAgICAgaWYgdGFnIGlzIDB4MDMgIyBNUDRFU0Rlc2NyVGFnXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgyKSAjIGlkXG4gICAgICAgICAgICBmbGFncyA9IHN0cmVhbS5yZWFkVUludDgoKVxuXG4gICAgICAgICAgICBpZiBmbGFncyAmIDB4ODAgIyBzdHJlYW1EZXBlbmRlbmNlRmxhZ1xuICAgICAgICAgICAgICAgIHN0cmVhbS5hZHZhbmNlKDIpXG5cbiAgICAgICAgICAgIGlmIGZsYWdzICYgMHg0MCAjIFVSTF9GbGFnXG4gICAgICAgICAgICAgICAgc3RyZWFtLmFkdmFuY2Ugc3RyZWFtLnJlYWRVSW50OCgpXG5cbiAgICAgICAgICAgIGlmIGZsYWdzICYgMHgyMCAjIE9DUnN0cmVhbUZsYWdcbiAgICAgICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgyKVxuXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0cmVhbS5hZHZhbmNlKDIpICMgaWRcblxuICAgICAgICB0YWcgPSBzdHJlYW0ucmVhZFVJbnQ4KClcbiAgICAgICAgbGVuID0gTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oc3RyZWFtKVxuICAgICAgICAgICAgXG4gICAgICAgIGlmIHRhZyBpcyAweDA0ICMgTVA0RGVjQ29uZmlnRGVzY3JUYWdcbiAgICAgICAgICAgIGNvZGVjX2lkID0gc3RyZWFtLnJlYWRVSW50OCgpICMgbWlnaHQgd2FudCB0aGlzLi4uIChpc29tLmM6MzUpXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgxKSAjIHN0cmVhbSB0eXBlXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSgzKSAjIGJ1ZmZlciBzaXplXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSg0KSAjIG1heCBiaXRyYXRlXG4gICAgICAgICAgICBzdHJlYW0uYWR2YW5jZSg0KSAjIGF2ZyBiaXRyYXRlXG5cbiAgICAgICAgICAgIHRhZyA9IHN0cmVhbS5yZWFkVUludDgoKVxuICAgICAgICAgICAgbGVuID0gTTRBRGVtdXhlci5yZWFkRGVzY3JMZW4oc3RyZWFtKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiB0YWcgaXMgMHgwNSAjIE1QNERlY1NwZWNpZmljRGVzY3JUYWdcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyZWFtLnJlYWRCdWZmZXIobGVuKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgXG4gICAgIyB0aW1lIHRvIHNhbXBsZVxuICAgIGF0b20gJ21vb3YudHJhay5tZGlhLm1pbmYuc3RibC5zdHRzJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIGVudHJpZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICBAdHJhY2suc3R0cyA9IFtdXG4gICAgICAgIGZvciBpIGluIFswLi4uZW50cmllc10gYnkgMVxuICAgICAgICAgICAgQHRyYWNrLnN0dHNbaV0gPVxuICAgICAgICAgICAgICAgIGNvdW50OiBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIGR1cmF0aW9uOiBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICBAc2V0dXBTZWVrUG9pbnRzKClcbiAgICBcbiAgICAjIHNhbXBsZSB0byBjaHVua1xuICAgIGF0b20gJ21vb3YudHJhay5tZGlhLm1pbmYuc3RibC5zdHNjJywgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgICAgIGVudHJpZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICBAdHJhY2suc3RzYyA9IFtdXG4gICAgICAgIGZvciBpIGluIFswLi4uZW50cmllc10gYnkgMVxuICAgICAgICAgICAgQHRyYWNrLnN0c2NbaV0gPSBcbiAgICAgICAgICAgICAgICBmaXJzdDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBjb3VudDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBpZDogQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgQHNldHVwU2Vla1BvaW50cygpXG4gICAgICAgIFxuICAgICMgc2FtcGxlIHNpemVcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RzeicsIC0+XG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZSg0KSAjIHZlcnNpb24gYW5kIGZsYWdzXG4gICAgICAgIFxuICAgICAgICBAdHJhY2suc2FtcGxlU2l6ZSA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIGVudHJpZXMgPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICBcbiAgICAgICAgaWYgQHRyYWNrLnNhbXBsZVNpemUgaXMgMCBhbmQgZW50cmllcyA+IDBcbiAgICAgICAgICAgIEB0cmFjay5zYW1wbGVTaXplcyA9IFtdXG4gICAgICAgICAgICBmb3IgaSBpbiBbMC4uLmVudHJpZXNdIGJ5IDFcbiAgICAgICAgICAgICAgICBAdHJhY2suc2FtcGxlU2l6ZXNbaV0gPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICBAc2V0dXBTZWVrUG9pbnRzKClcbiAgICBcbiAgICAjIGNodW5rIG9mZnNldHNcbiAgICBhdG9tICdtb292LnRyYWsubWRpYS5taW5mLnN0Ymwuc3RjbycsIC0+ICMgVE9ETzogY282NFxuICAgICAgICBAc3RyZWFtLmFkdmFuY2UoNCkgIyB2ZXJzaW9uIGFuZCBmbGFnc1xuICAgICAgICBcbiAgICAgICAgZW50cmllcyA9IEBzdHJlYW0ucmVhZFVJbnQzMigpXG4gICAgICAgIEB0cmFjay5jaHVua09mZnNldHMgPSBbXVxuICAgICAgICBmb3IgaSBpbiBbMC4uLmVudHJpZXNdIGJ5IDFcbiAgICAgICAgICAgIEB0cmFjay5jaHVua09mZnNldHNbaV0gPSBAc3RyZWFtLnJlYWRVSW50MzIoKVxuICAgICAgICAgICAgXG4gICAgICAgIEBzZXR1cFNlZWtQb2ludHMoKVxuICAgICAgICBcbiAgICAjIGNoYXB0ZXIgdHJhY2sgcmVmZXJlbmNlXG4gICAgYXRvbSAnbW9vdi50cmFrLnRyZWYuY2hhcCcsIC0+XG4gICAgICAgIGVudHJpZXMgPSBAbGVuID4+IDJcbiAgICAgICAgQHRyYWNrLmNoYXB0ZXJUcmFja3MgPSBbXVxuICAgICAgICBmb3IgaSBpbiBbMC4uLmVudHJpZXNdIGJ5IDFcbiAgICAgICAgICAgIEB0cmFjay5jaGFwdGVyVHJhY2tzW2ldID0gQHN0cmVhbS5yZWFkVUludDMyKClcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG4gICAgIyBvbmNlIHdlIGhhdmUgYWxsIHRoZSBpbmZvcm1hdGlvbiB3ZSBuZWVkLCBnZW5lcmF0ZSB0aGUgc2VlayB0YWJsZSBmb3IgdGhpcyB0cmFja1xuICAgIHNldHVwU2Vla1BvaW50czogLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAdHJhY2suY2h1bmtPZmZzZXRzPyBhbmQgQHRyYWNrLnN0c2M/IGFuZCBAdHJhY2suc2FtcGxlU2l6ZT8gYW5kIEB0cmFjay5zdHRzP1xuICAgICAgICBcbiAgICAgICAgc3RzY0luZGV4ID0gMFxuICAgICAgICBzdHRzSW5kZXggPSAwXG4gICAgICAgIHN0dHNJbmRleCA9IDBcbiAgICAgICAgc3R0c1NhbXBsZSA9IDBcbiAgICAgICAgc2FtcGxlSW5kZXggPSAwXG4gICAgICAgIFxuICAgICAgICBvZmZzZXQgPSAwXG4gICAgICAgIHRpbWVzdGFtcCA9IDBcbiAgICAgICAgQHRyYWNrLnNlZWtQb2ludHMgPSBbXVxuICAgICAgICBcbiAgICAgICAgZm9yIHBvc2l0aW9uLCBpIGluIEB0cmFjay5jaHVua09mZnNldHNcbiAgICAgICAgICAgIGZvciBqIGluIFswLi4uQHRyYWNrLnN0c2Nbc3RzY0luZGV4XS5jb3VudF0gYnkgMVxuICAgICAgICAgICAgICAgICMgcHVzaCB0aGUgdGltZXN0YW1wIGFuZCBib3RoIHRoZSBwaHlzaWNhbCBwb3NpdGlvbiBpbiB0aGUgZmlsZVxuICAgICAgICAgICAgICAgICMgYW5kIHRoZSBvZmZzZXQgd2l0aG91dCBnYXBzIGZyb20gdGhlIHN0YXJ0IG9mIHRoZSBkYXRhXG4gICAgICAgICAgICAgICAgQHRyYWNrLnNlZWtQb2ludHMucHVzaFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXQ6IG9mZnNldFxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogcG9zaXRpb25cbiAgICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiB0aW1lc3RhbXBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBzaXplID0gQHRyYWNrLnNhbXBsZVNpemUgb3IgQHRyYWNrLnNhbXBsZVNpemVzW3NhbXBsZUluZGV4KytdXG4gICAgICAgICAgICAgICAgb2Zmc2V0ICs9IHNpemVcbiAgICAgICAgICAgICAgICBwb3NpdGlvbiArPSBzaXplXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wICs9IEB0cmFjay5zdHRzW3N0dHNJbmRleF0uZHVyYXRpb25cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiBzdHRzSW5kZXggKyAxIDwgQHRyYWNrLnN0dHMubGVuZ3RoIGFuZCArK3N0dHNTYW1wbGUgaXMgQHRyYWNrLnN0dHNbc3R0c0luZGV4XS5jb3VudFxuICAgICAgICAgICAgICAgICAgICBzdHRzU2FtcGxlID0gMFxuICAgICAgICAgICAgICAgICAgICBzdHRzSW5kZXgrK1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIHN0c2NJbmRleCArIDEgPCBAdHJhY2suc3RzYy5sZW5ndGggYW5kIGkgKyAxIGlzIEB0cmFjay5zdHNjW3N0c2NJbmRleCArIDFdLmZpcnN0XG4gICAgICAgICAgICAgICAgc3RzY0luZGV4KytcbiAgICAgICAgXG4gICAgYWZ0ZXIgJ21vb3YnLCAtPiAgICAgICAgXG4gICAgICAgICMgaWYgdGhlIG1kYXQgYmxvY2sgd2FzIGF0IHRoZSBiZWdpbm5pbmcgcmF0aGVyIHRoYW4gdGhlIGVuZCwganVtcCBiYWNrIHRvIGl0XG4gICAgICAgIGlmIEBtZGF0T2Zmc2V0P1xuICAgICAgICAgICAgQHN0cmVhbS5zZWVrIEBtZGF0T2Zmc2V0IC0gOFxuICAgICAgICAgICAgXG4gICAgICAgICMgY2hvb3NlIGEgdHJhY2tcbiAgICAgICAgZm9yIHRyYWNrIGluIEB0cmFja3Mgd2hlbiB0cmFjay50eXBlIGlzICdzb3VuJ1xuICAgICAgICAgICAgQHRyYWNrID0gdHJhY2tcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBcbiAgICAgICAgaWYgQHRyYWNrLnR5cGUgaXNudCAnc291bidcbiAgICAgICAgICAgIEB0cmFjayA9IG51bGxcbiAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnTm8gYXVkaW8gdHJhY2tzIGluIG00YSBmaWxlLidcbiAgICAgICAgICAgIFxuICAgICAgICAjIGVtaXQgaW5mb1xuICAgICAgICBAZW1pdCAnZm9ybWF0JywgQHRyYWNrLmZvcm1hdFxuICAgICAgICBAZW1pdCAnZHVyYXRpb24nLCBAdHJhY2suZHVyYXRpb24gLyBAdHJhY2sudGltZVNjYWxlICogMTAwMCB8IDBcbiAgICAgICAgaWYgQHRyYWNrLmNvb2tpZVxuICAgICAgICAgICAgQGVtaXQgJ2Nvb2tpZScsIEB0cmFjay5jb29raWVcbiAgICAgICAgXG4gICAgICAgICMgdXNlIHRoZSBzZWVrIHBvaW50cyBmcm9tIHRoZSBzZWxlY3RlZCB0cmFja1xuICAgICAgICBAc2Vla1BvaW50cyA9IEB0cmFjay5zZWVrUG9pbnRzXG4gICAgICAgIFxuICAgIGF0b20gJ21kYXQnLCAtPlxuICAgICAgICBpZiBub3QgQHN0YXJ0ZWREYXRhXG4gICAgICAgICAgICBAbWRhdE9mZnNldCA/PSBAc3RyZWFtLm9mZnNldFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIGlmIHdlIGhhdmVuJ3QgcmVhZCB0aGUgaGVhZGVycyB5ZXQsIHRoZSBtZGF0IGF0b20gd2FzIGF0IHRoZSBiZWdpbm5pbmdcbiAgICAgICAgICAgICMgcmF0aGVyIHRoYW4gdGhlIGVuZC4gU2tpcCBvdmVyIGl0IGZvciBub3cgdG8gcmVhZCB0aGUgaGVhZGVycyBmaXJzdCwgYW5kXG4gICAgICAgICAgICAjIGNvbWUgYmFjayBsYXRlci5cbiAgICAgICAgICAgIGlmIEB0cmFja3MubGVuZ3RoIGlzIDBcbiAgICAgICAgICAgICAgICBieXRlcyA9IE1hdGgubWluKEBzdHJlYW0ucmVtYWluaW5nQnl0ZXMoKSwgQGxlbilcbiAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UgYnl0ZXNcbiAgICAgICAgICAgICAgICBAbGVuIC09IGJ5dGVzXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEBjaHVua0luZGV4ID0gMFxuICAgICAgICAgICAgQHN0c2NJbmRleCA9IDBcbiAgICAgICAgICAgIEBzYW1wbGVJbmRleCA9IDBcbiAgICAgICAgICAgIEB0YWlsT2Zmc2V0ID0gMFxuICAgICAgICAgICAgQHRhaWxTYW1wbGVzID0gMFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBAc3RhcnRlZERhdGEgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgIyByZWFkIHRoZSBjaGFwdGVyIGluZm9ybWF0aW9uIGlmIGFueVxuICAgICAgICB1bmxlc3MgQHJlYWRDaGFwdGVyc1xuICAgICAgICAgICAgQHJlYWRDaGFwdGVycyA9IEBwYXJzZUNoYXB0ZXJzKClcbiAgICAgICAgICAgIHJldHVybiBpZiBAYnJlYWsgPSBub3QgQHJlYWRDaGFwdGVyc1xuICAgICAgICAgICAgQHN0cmVhbS5zZWVrIEBtZGF0T2Zmc2V0XG4gICAgICAgICAgICBcbiAgICAgICAgIyBnZXQgdGhlIHN0YXJ0aW5nIG9mZnNldFxuICAgICAgICBvZmZzZXQgPSBAdHJhY2suY2h1bmtPZmZzZXRzW0BjaHVua0luZGV4XSArIEB0YWlsT2Zmc2V0XG4gICAgICAgIGxlbmd0aCA9IDBcbiAgICAgICAgXG4gICAgICAgICMgbWFrZSBzdXJlIHdlIGhhdmUgZW5vdWdoIGRhdGEgdG8gZ2V0IHRvIHRoZSBvZmZzZXRcbiAgICAgICAgdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKG9mZnNldCAtIEBzdHJlYW0ub2Zmc2V0KVxuICAgICAgICAgICAgQGJyZWFrID0gdHJ1ZVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIFxuICAgICAgICAjIHNlZWsgdG8gdGhlIG9mZnNldFxuICAgICAgICBAc3RyZWFtLnNlZWsob2Zmc2V0KVxuICAgICAgICBcbiAgICAgICAgIyBjYWxjdWxhdGUgdGhlIG1heGltdW0gbGVuZ3RoIHdlIGNhbiByZWFkIGF0IG9uY2VcbiAgICAgICAgd2hpbGUgQGNodW5rSW5kZXggPCBAdHJhY2suY2h1bmtPZmZzZXRzLmxlbmd0aFxuICAgICAgICAgICAgIyBjYWxjdWxhdGUgdGhlIHNpemUgaW4gYnl0ZXMgb2YgdGhlIGNodW5rIHVzaW5nIHRoZSBzYW1wbGUgc2l6ZSB0YWJsZVxuICAgICAgICAgICAgbnVtU2FtcGxlcyA9IEB0cmFjay5zdHNjW0BzdHNjSW5kZXhdLmNvdW50IC0gQHRhaWxTYW1wbGVzXG4gICAgICAgICAgICBjaHVua1NpemUgPSAwXG4gICAgICAgICAgICBmb3Igc2FtcGxlIGluIFswLi4ubnVtU2FtcGxlc10gYnkgMVxuICAgICAgICAgICAgICAgIHNpemUgPSBAdHJhY2suc2FtcGxlU2l6ZSBvciBAdHJhY2suc2FtcGxlU2l6ZXNbQHNhbXBsZUluZGV4XVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICMgaWYgd2UgZG9uJ3QgaGF2ZSBlbm91Z2ggZGF0YSB0byBhZGQgdGhpcyBzYW1wbGUsIGp1bXAgb3V0XG4gICAgICAgICAgICAgICAgYnJlYWsgdW5sZXNzIEBzdHJlYW0uYXZhaWxhYmxlKGxlbmd0aCArIHNpemUpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgbGVuZ3RoICs9IHNpemVcbiAgICAgICAgICAgICAgICBjaHVua1NpemUgKz0gc2l6ZVxuICAgICAgICAgICAgICAgIEBzYW1wbGVJbmRleCsrXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgaWYgd2UgZGlkbid0IG1ha2UgaXQgdGhyb3VnaCB0aGUgd2hvbGUgY2h1bmssIGFkZCB3aGF0IHdlIGRpZCB1c2UgdG8gdGhlIHRhaWxcbiAgICAgICAgICAgIGlmIHNhbXBsZSA8IG51bVNhbXBsZXNcbiAgICAgICAgICAgICAgICBAdGFpbE9mZnNldCArPSBjaHVua1NpemVcbiAgICAgICAgICAgICAgICBAdGFpbFNhbXBsZXMgKz0gc2FtcGxlXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAjIG90aGVyd2lzZSwgd2UgY2FuIG1vdmUgdG8gdGhlIG5leHQgY2h1bmtcbiAgICAgICAgICAgICAgICBAY2h1bmtJbmRleCsrXG4gICAgICAgICAgICAgICAgQHRhaWxPZmZzZXQgPSAwXG4gICAgICAgICAgICAgICAgQHRhaWxTYW1wbGVzID0gMFxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICMgaWYgd2UndmUgbWFkZSBpdCB0byB0aGUgZW5kIG9mIGEgbGlzdCBvZiBzdWJzZXF1ZW50IGNodW5rcyB3aXRoIHRoZSBzYW1lIG51bWJlciBvZiBzYW1wbGVzLFxuICAgICAgICAgICAgICAgICMgZ28gdG8gdGhlIG5leHQgc2FtcGxlIHRvIGNodW5rIGVudHJ5XG4gICAgICAgICAgICAgICAgaWYgQHN0c2NJbmRleCArIDEgPCBAdHJhY2suc3RzYy5sZW5ndGggYW5kIEBjaHVua0luZGV4ICsgMSBpcyBAdHJhY2suc3RzY1tAc3RzY0luZGV4ICsgMV0uZmlyc3RcbiAgICAgICAgICAgICAgICAgICAgQHN0c2NJbmRleCsrXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgIyBpZiB0aGUgbmV4dCBjaHVuayBpc24ndCByaWdodCBhZnRlciB0aGlzIG9uZSwganVtcCBvdXRcbiAgICAgICAgICAgICAgICBpZiBvZmZzZXQgKyBsZW5ndGggaXNudCBAdHJhY2suY2h1bmtPZmZzZXRzW0BjaHVua0luZGV4XVxuICAgICAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICBcbiAgICAgICAgIyBlbWl0IHNvbWUgZGF0YSBpZiB3ZSBoYXZlIGFueSwgb3RoZXJ3aXNlIHdhaXQgZm9yIG1vcmVcbiAgICAgICAgaWYgbGVuZ3RoID4gMFxuICAgICAgICAgICAgQGVtaXQgJ2RhdGEnLCBAc3RyZWFtLnJlYWRCdWZmZXIobGVuZ3RoKVxuICAgICAgICAgICAgQGJyZWFrID0gQGNodW5rSW5kZXggaXMgQHRyYWNrLmNodW5rT2Zmc2V0cy5sZW5ndGhcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgQGJyZWFrID0gdHJ1ZVxuICAgICAgICAgICAgXG4gICAgcGFyc2VDaGFwdGVyczogLT5cbiAgICAgICAgcmV0dXJuIHRydWUgdW5sZXNzIEB0cmFjay5jaGFwdGVyVHJhY2tzPy5sZW5ndGggPiAwXG5cbiAgICAgICAgIyBmaW5kIHRoZSBjaGFwdGVyIHRyYWNrXG4gICAgICAgIGlkID0gQHRyYWNrLmNoYXB0ZXJUcmFja3NbMF1cbiAgICAgICAgZm9yIHRyYWNrIGluIEB0cmFja3NcbiAgICAgICAgICAgIGJyZWFrIGlmIHRyYWNrLmlkIGlzIGlkXG5cbiAgICAgICAgaWYgdHJhY2suaWQgaXNudCBpZFxuICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgJ0NoYXB0ZXIgdHJhY2sgZG9lcyBub3QgZXhpc3QuJ1xuXG4gICAgICAgIEBjaGFwdGVycyA/PSBbXVxuICAgICAgICBcbiAgICAgICAgIyB1c2UgdGhlIHNlZWsgdGFibGUgb2Zmc2V0cyB0byBmaW5kIGNoYXB0ZXIgdGl0bGVzXG4gICAgICAgIHdoaWxlIEBjaGFwdGVycy5sZW5ndGggPCB0cmFjay5zZWVrUG9pbnRzLmxlbmd0aFxuICAgICAgICAgICAgcG9pbnQgPSB0cmFjay5zZWVrUG9pbnRzW0BjaGFwdGVycy5sZW5ndGhdXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgbWFrZSBzdXJlIHdlIGhhdmUgZW5vdWdoIGRhdGFcbiAgICAgICAgICAgIHJldHVybiBmYWxzZSB1bmxlc3MgQHN0cmVhbS5hdmFpbGFibGUocG9pbnQucG9zaXRpb24gLSBAc3RyZWFtLm9mZnNldCArIDMyKVxuXG4gICAgICAgICAgICAjIGp1bXAgdG8gdGhlIHRpdGxlIG9mZnNldFxuICAgICAgICAgICAgQHN0cmVhbS5zZWVrIHBvaW50LnBvc2l0aW9uXG5cbiAgICAgICAgICAgICMgcmVhZCB0aGUgbGVuZ3RoIG9mIHRoZSB0aXRsZSBzdHJpbmdcbiAgICAgICAgICAgIGxlbiA9IEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgICAgICB0aXRsZSA9IG51bGxcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShsZW4pXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgaWYgdGhlcmUgaXMgYSBCT00gbWFya2VyLCByZWFkIGEgdXRmMTYgc3RyaW5nXG4gICAgICAgICAgICBpZiBsZW4gPiAyXG4gICAgICAgICAgICAgICAgYm9tID0gQHN0cmVhbS5wZWVrVUludDE2KClcbiAgICAgICAgICAgICAgICBpZiBib20gaW4gWzB4ZmVmZiwgMHhmZmZlXVxuICAgICAgICAgICAgICAgICAgICB0aXRsZSA9IEBzdHJlYW0ucmVhZFN0cmluZyhsZW4sICd1dGYxNi1ib20nKVxuXG4gICAgICAgICAgICAjIG90aGVyd2lzZSwgdXNlIHV0ZjhcbiAgICAgICAgICAgIHRpdGxlID89IEBzdHJlYW0ucmVhZFN0cmluZyhsZW4sICd1dGY4JylcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBhZGQgdGhlIGNoYXB0ZXIgdGl0bGUsIHRpbWVzdGFtcCwgYW5kIGR1cmF0aW9uXG4gICAgICAgICAgICBuZXh0VGltZXN0YW1wID0gdHJhY2suc2Vla1BvaW50c1tAY2hhcHRlcnMubGVuZ3RoICsgMV0/LnRpbWVzdGFtcCA/IHRyYWNrLmR1cmF0aW9uXG4gICAgICAgICAgICBAY2hhcHRlcnMucHVzaFxuICAgICAgICAgICAgICAgIHRpdGxlOiB0aXRsZVxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogcG9pbnQudGltZXN0YW1wIC8gdHJhY2sudGltZVNjYWxlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICBkdXJhdGlvbjogKG5leHRUaW1lc3RhbXAgLSBwb2ludC50aW1lc3RhbXApIC8gdHJhY2sudGltZVNjYWxlICogMTAwMCB8IDBcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgIyB3ZSdyZSBkb25lLCBzbyBlbWl0IHRoZSBjaGFwdGVyIGRhdGFcbiAgICAgICAgQGVtaXQgJ2NoYXB0ZXJzJywgQGNoYXB0ZXJzXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIFxuICAgICMgbWV0YWRhdGEgY2h1bmtcbiAgICBhdG9tICdtb292LnVkdGEubWV0YScsIC0+XG4gICAgICAgIEBtZXRhZGF0YSA9IHt9ICAgICAgICBcbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgdmVyc2lvbiBhbmQgZmxhZ3NcbiAgICAgICAgXG4gICAgIyBlbWl0IHdoZW4gd2UncmUgZG9uZVxuICAgIGFmdGVyICdtb292LnVkdGEubWV0YScsIC0+XG4gICAgICAgIEBlbWl0ICdtZXRhZGF0YScsIEBtZXRhZGF0YVxuXG4gICAgIyBjb252aWVuaWVuY2UgZnVuY3Rpb24gdG8gZ2VuZXJhdGUgbWV0YWRhdGEgYXRvbSBoYW5kbGVyXG4gICAgbWV0YSA9IChmaWVsZCwgbmFtZSwgZm4pIC0+XG4gICAgICAgIGF0b20gXCJtb292LnVkdGEubWV0YS5pbHN0LiN7ZmllbGR9LmRhdGFcIiwgLT5cbiAgICAgICAgICAgIEBzdHJlYW0uYWR2YW5jZSg4KVxuICAgICAgICAgICAgQGxlbiAtPSA4XG4gICAgICAgICAgICBmbi5jYWxsIHRoaXMsIG5hbWVcblxuICAgICMgc3RyaW5nIGZpZWxkIHJlYWRlclxuICAgIHN0cmluZyA9IChmaWVsZCkgLT5cbiAgICAgICAgQG1ldGFkYXRhW2ZpZWxkXSA9IEBzdHJlYW0ucmVhZFN0cmluZyhAbGVuLCAndXRmOCcpXG5cbiAgICAjIGZyb20gaHR0cDovL2F0b21pY3BhcnNsZXkuc291cmNlZm9yZ2UubmV0L21wZWctNGZpbGVzLmh0bWxcbiAgICBtZXRhICfCqWFsYicsICdhbGJ1bScsIHN0cmluZ1xuICAgIG1ldGEgJ8KpYXJnJywgJ2FycmFuZ2VyJywgc3RyaW5nXG4gICAgbWV0YSAnwqlhcnQnLCAnYXJ0aXN0Jywgc3RyaW5nXG4gICAgbWV0YSAnwqlBUlQnLCAnYXJ0aXN0Jywgc3RyaW5nXG4gICAgbWV0YSAnYUFSVCcsICdhbGJ1bUFydGlzdCcsIHN0cmluZ1xuICAgIG1ldGEgJ2NhdGcnLCAnY2F0ZWdvcnknLCBzdHJpbmdcbiAgICBtZXRhICfCqWNvbScsICdjb21wb3NlcicsIHN0cmluZ1xuICAgIG1ldGEgJ8KpY3B5JywgJ2NvcHlyaWdodCcsIHN0cmluZ1xuICAgIG1ldGEgJ2NwcnQnLCAnY29weXJpZ2h0Jywgc3RyaW5nXG4gICAgbWV0YSAnwqljbXQnLCAnY29tbWVudHMnLCBzdHJpbmdcbiAgICBtZXRhICfCqWRheScsICdyZWxlYXNlRGF0ZScsIHN0cmluZ1xuICAgIG1ldGEgJ2Rlc2MnLCAnZGVzY3JpcHRpb24nLCBzdHJpbmdcbiAgICBtZXRhICfCqWdlbicsICdnZW5yZScsIHN0cmluZyAjIGN1c3RvbSBnZW5yZXNcbiAgICBtZXRhICfCqWdycCcsICdncm91cGluZycsIHN0cmluZ1xuICAgIG1ldGEgJ8KpaXNyJywgJ0lTUkMnLCBzdHJpbmdcbiAgICBtZXRhICdrZXl3JywgJ2tleXdvcmRzJywgc3RyaW5nXG4gICAgbWV0YSAnwqlsYWInLCAncmVjb3JkTGFiZWwnLCBzdHJpbmdcbiAgICBtZXRhICdsZGVzJywgJ2xvbmdEZXNjcmlwdGlvbicsIHN0cmluZ1xuICAgIG1ldGEgJ8KpbHlyJywgJ2x5cmljcycsIHN0cmluZ1xuICAgIG1ldGEgJ8KpbmFtJywgJ3RpdGxlJywgc3RyaW5nXG4gICAgbWV0YSAnwqlwaGcnLCAncmVjb3JkaW5nQ29weXJpZ2h0Jywgc3RyaW5nXG4gICAgbWV0YSAnwqlwcmQnLCAncHJvZHVjZXInLCBzdHJpbmdcbiAgICBtZXRhICfCqXByZicsICdwZXJmb3JtZXJzJywgc3RyaW5nXG4gICAgbWV0YSAncHVyZCcsICdwdXJjaGFzZURhdGUnLCBzdHJpbmdcbiAgICBtZXRhICdwdXJsJywgJ3BvZGNhc3RVUkwnLCBzdHJpbmdcbiAgICBtZXRhICfCqXN3ZicsICdzb25nd3JpdGVyJywgc3RyaW5nXG4gICAgbWV0YSAnwql0b28nLCAnZW5jb2RlcicsIHN0cmluZ1xuICAgIG1ldGEgJ8Kpd3J0JywgJ2NvbXBvc2VyJywgc3RyaW5nXG5cbiAgICBtZXRhICdjb3ZyJywgJ2NvdmVyQXJ0JywgKGZpZWxkKSAtPlxuICAgICAgICBAbWV0YWRhdGFbZmllbGRdID0gQHN0cmVhbS5yZWFkQnVmZmVyKEBsZW4pXG5cbiAgICAjIHN0YW5kYXJkIGdlbnJlc1xuICAgIGdlbnJlcyA9IFtcbiAgICAgICAgXCJCbHVlc1wiLCBcIkNsYXNzaWMgUm9ja1wiLCBcIkNvdW50cnlcIiwgXCJEYW5jZVwiLCBcIkRpc2NvXCIsIFwiRnVua1wiLCBcIkdydW5nZVwiLCBcbiAgICAgICAgXCJIaXAtSG9wXCIsIFwiSmF6elwiLCBcIk1ldGFsXCIsIFwiTmV3IEFnZVwiLCBcIk9sZGllc1wiLCBcIk90aGVyXCIsIFwiUG9wXCIsIFwiUiZCXCIsXG4gICAgICAgIFwiUmFwXCIsIFwiUmVnZ2FlXCIsIFwiUm9ja1wiLCBcIlRlY2hub1wiLCBcIkluZHVzdHJpYWxcIiwgXCJBbHRlcm5hdGl2ZVwiLCBcIlNrYVwiLCBcbiAgICAgICAgXCJEZWF0aCBNZXRhbFwiLCBcIlByYW5rc1wiLCBcIlNvdW5kdHJhY2tcIiwgXCJFdXJvLVRlY2hub1wiLCBcIkFtYmllbnRcIiwgXG4gICAgICAgIFwiVHJpcC1Ib3BcIiwgXCJWb2NhbFwiLCBcIkphenorRnVua1wiLCBcIkZ1c2lvblwiLCBcIlRyYW5jZVwiLCBcIkNsYXNzaWNhbFwiLCBcbiAgICAgICAgXCJJbnN0cnVtZW50YWxcIiwgXCJBY2lkXCIsIFwiSG91c2VcIiwgXCJHYW1lXCIsIFwiU291bmQgQ2xpcFwiLCBcIkdvc3BlbFwiLCBcIk5vaXNlXCIsXG4gICAgICAgIFwiQWx0ZXJuUm9ja1wiLCBcIkJhc3NcIiwgXCJTb3VsXCIsIFwiUHVua1wiLCBcIlNwYWNlXCIsIFwiTWVkaXRhdGl2ZVwiLCBcIkluc3RydW1lbnRhbCBQb3BcIiwgXG4gICAgICAgIFwiSW5zdHJ1bWVudGFsIFJvY2tcIiwgXCJFdGhuaWNcIiwgXCJHb3RoaWNcIiwgIFwiRGFya3dhdmVcIiwgXCJUZWNobm8tSW5kdXN0cmlhbFwiLCBcbiAgICAgICAgXCJFbGVjdHJvbmljXCIsIFwiUG9wLUZvbGtcIiwgXCJFdXJvZGFuY2VcIiwgXCJEcmVhbVwiLCBcIlNvdXRoZXJuIFJvY2tcIiwgXCJDb21lZHlcIiwgXG4gICAgICAgIFwiQ3VsdFwiLCBcIkdhbmdzdGFcIiwgXCJUb3AgNDBcIiwgXCJDaHJpc3RpYW4gUmFwXCIsIFwiUG9wL0Z1bmtcIiwgXCJKdW5nbGVcIiwgXG4gICAgICAgIFwiTmF0aXZlIEFtZXJpY2FuXCIsIFwiQ2FiYXJldFwiLCBcIk5ldyBXYXZlXCIsIFwiUHN5Y2hhZGVsaWNcIiwgXCJSYXZlXCIsIFwiU2hvd3R1bmVzXCIsXG4gICAgICAgIFwiVHJhaWxlclwiLCBcIkxvLUZpXCIsIFwiVHJpYmFsXCIsIFwiQWNpZCBQdW5rXCIsIFwiQWNpZCBKYXp6XCIsIFwiUG9sa2FcIiwgXCJSZXRyb1wiLCBcbiAgICAgICAgXCJNdXNpY2FsXCIsIFwiUm9jayAmIFJvbGxcIiwgXCJIYXJkIFJvY2tcIiwgXCJGb2xrXCIsIFwiRm9say9Sb2NrXCIsIFwiTmF0aW9uYWwgRm9sa1wiLCBcbiAgICAgICAgXCJTd2luZ1wiLCBcIkZhc3QgRnVzaW9uXCIsIFwiQmVib2JcIiwgXCJMYXRpblwiLCBcIlJldml2YWxcIiwgXCJDZWx0aWNcIiwgXCJCbHVlZ3Jhc3NcIixcbiAgICAgICAgXCJBdmFudGdhcmRlXCIsIFwiR290aGljIFJvY2tcIiwgXCJQcm9ncmVzc2l2ZSBSb2NrXCIsIFwiUHN5Y2hlZGVsaWMgUm9ja1wiLCBcIlN5bXBob25pYyBSb2NrXCIsXG4gICAgICAgIFwiU2xvdyBSb2NrXCIsIFwiQmlnIEJhbmRcIiwgXCJDaG9ydXNcIiwgXCJFYXN5IExpc3RlbmluZ1wiLCBcIkFjb3VzdGljXCIsIFwiSHVtb3VyXCIsIFwiU3BlZWNoXCIsIFxuICAgICAgICBcIkNoYW5zb25cIiwgXCJPcGVyYVwiLCBcIkNoYW1iZXIgTXVzaWNcIiwgXCJTb25hdGFcIiwgXCJTeW1waG9ueVwiLCBcIkJvb3R5IEJhc3NcIiwgXCJQcmltdXNcIiwgXG4gICAgICAgIFwiUG9ybiBHcm9vdmVcIiwgXCJTYXRpcmVcIiwgXCJTbG93IEphbVwiLCBcIkNsdWJcIiwgXCJUYW5nb1wiLCBcIlNhbWJhXCIsIFwiRm9sa2xvcmVcIiwgXCJCYWxsYWRcIiwgXG4gICAgICAgIFwiUG93ZXIgQmFsbGFkXCIsIFwiUmh5dGhtaWMgU291bFwiLCBcIkZyZWVzdHlsZVwiLCBcIkR1ZXRcIiwgXCJQdW5rIFJvY2tcIiwgXCJEcnVtIFNvbG9cIiwgXG4gICAgICAgIFwiQSBDYXBlbGxhXCIsIFwiRXVyby1Ib3VzZVwiLCBcIkRhbmNlIEhhbGxcIlxuICAgIF1cblxuICAgIG1ldGEgJ2ducmUnLCAnZ2VucmUnLCAoZmllbGQpIC0+XG4gICAgICAgIEBtZXRhZGF0YVtmaWVsZF0gPSBnZW5yZXNbQHN0cmVhbS5yZWFkVUludDE2KCkgLSAxXVxuXG4gICAgbWV0YSAndG1wbycsICd0ZW1wbycsIChmaWVsZCkgLT5cbiAgICAgICAgQG1ldGFkYXRhW2ZpZWxkXSA9IEBzdHJlYW0ucmVhZFVJbnQxNigpXG5cbiAgICBtZXRhICdydG5nJywgJ3JhdGluZycsIChmaWVsZCkgLT5cbiAgICAgICAgcmF0aW5nID0gQHN0cmVhbS5yZWFkVUludDgoKVxuICAgICAgICBAbWV0YWRhdGFbZmllbGRdID0gaWYgcmF0aW5nIGlzIDIgdGhlbiAnQ2xlYW4nIGVsc2UgaWYgcmF0aW5nIGlzbnQgMCB0aGVuICdFeHBsaWNpdCcgZWxzZSAnTm9uZSdcblxuICAgIGRpc2tUcmFjayA9IChmaWVsZCkgLT5cbiAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDIpXG4gICAgICAgIEBtZXRhZGF0YVtmaWVsZF0gPSBAc3RyZWFtLnJlYWRVSW50MTYoKSArICcgb2YgJyArIEBzdHJlYW0ucmVhZFVJbnQxNigpXG4gICAgICAgIEBzdHJlYW0uYWR2YW5jZShAbGVuIC0gNilcblxuICAgIG1ldGEgJ2Rpc2snLCAnZGlza051bWJlcicsIGRpc2tUcmFja1xuICAgIG1ldGEgJ3Rya24nLCAndHJhY2tOdW1iZXInLCBkaXNrVHJhY2tcblxuICAgIGJvb2wgPSAoZmllbGQpIC0+XG4gICAgICAgIEBtZXRhZGF0YVtmaWVsZF0gPSBAc3RyZWFtLnJlYWRVSW50OCgpIGlzIDFcblxuICAgIG1ldGEgJ2NwaWwnLCAnY29tcGlsYXRpb24nLCBib29sXG4gICAgbWV0YSAncGNzdCcsICdwb2RjYXN0JywgYm9vbFxuICAgIG1ldGEgJ3BnYXAnLCAnZ2FwbGVzcycsIGJvb2xcbiAgICBcbm1vZHVsZS5leHBvcnRzID0gTTRBRGVtdXhlclxuIiwiRGVtdXhlciA9IHJlcXVpcmUgJy4uL2RlbXV4ZXInXG5cbmNsYXNzIFdBVkVEZW11eGVyIGV4dGVuZHMgRGVtdXhlclxuICAgIERlbXV4ZXIucmVnaXN0ZXIoV0FWRURlbXV4ZXIpXG4gICAgXG4gICAgQHByb2JlOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gYnVmZmVyLnBlZWtTdHJpbmcoMCwgNCkgaXMgJ1JJRkYnICYmIFxuICAgICAgICAgICAgICAgYnVmZmVyLnBlZWtTdHJpbmcoOCwgNCkgaXMgJ1dBVkUnXG4gICAgICAgICAgICAgICBcbiAgICBmb3JtYXRzID0gXG4gICAgICAgIDB4MDAwMTogJ2xwY20nXG4gICAgICAgIDB4MDAwMzogJ2xwY20nXG4gICAgICAgIDB4MDAwNjogJ2FsYXcnXG4gICAgICAgIDB4MDAwNzogJ3VsYXcnXG4gICAgICAgICAgICAgICBcbiAgICByZWFkQ2h1bms6IC0+XG4gICAgICAgIGlmIG5vdCBAcmVhZFN0YXJ0IGFuZCBAc3RyZWFtLmF2YWlsYWJsZSgxMilcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdSSUZGJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBXQVYgZmlsZS4nXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICBAZmlsZVNpemUgPSBAc3RyZWFtLnJlYWRVSW50MzIodHJ1ZSlcbiAgICAgICAgICAgIEByZWFkU3RhcnQgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIEBzdHJlYW0ucmVhZFN0cmluZyg0KSBpc250ICdXQVZFJ1xuICAgICAgICAgICAgICAgIHJldHVybiBAZW1pdCAnZXJyb3InLCAnSW52YWxpZCBXQVYgZmlsZS4nXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIHdoaWxlIEBzdHJlYW0uYXZhaWxhYmxlKDEpXG4gICAgICAgICAgICBpZiBub3QgQHJlYWRIZWFkZXJzIGFuZCBAc3RyZWFtLmF2YWlsYWJsZSg4KVxuICAgICAgICAgICAgICAgIEB0eXBlID0gQHN0cmVhbS5yZWFkU3RyaW5nKDQpXG4gICAgICAgICAgICAgICAgQGxlbiA9IEBzdHJlYW0ucmVhZFVJbnQzMih0cnVlKSAjIGxpdHRsZSBlbmRpYW5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHN3aXRjaCBAdHlwZVxuICAgICAgICAgICAgICAgIHdoZW4gJ2ZtdCAnXG4gICAgICAgICAgICAgICAgICAgIGVuY29kaW5nID0gQHN0cmVhbS5yZWFkVUludDE2KHRydWUpXG4gICAgICAgICAgICAgICAgICAgIGlmIGVuY29kaW5nIG5vdCBvZiBmb3JtYXRzXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gQGVtaXQgJ2Vycm9yJywgJ1Vuc3VwcG9ydGVkIGZvcm1hdCBpbiBXQVYgZmlsZS4nXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGZvcm1hdCA9IFxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybWF0SUQ6IGZvcm1hdHNbZW5jb2RpbmddXG4gICAgICAgICAgICAgICAgICAgICAgICBmbG9hdGluZ1BvaW50OiBlbmNvZGluZyBpcyAweDAwMDNcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpdHRsZUVuZGlhbjogZm9ybWF0c1tlbmNvZGluZ10gaXMgJ2xwY20nXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFubmVsc1BlckZyYW1lOiBAc3RyZWFtLnJlYWRVSW50MTYodHJ1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhbXBsZVJhdGU6IEBzdHJlYW0ucmVhZFVJbnQzMih0cnVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgZnJhbWVzUGVyUGFja2V0OiAxXG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKDQpICMgYnl0ZXMvc2VjLlxuICAgICAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoMikgIyBibG9jayBhbGlnblxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCA9IEBzdHJlYW0ucmVhZFVJbnQxNih0cnVlKVxuICAgICAgICAgICAgICAgICAgICBAZm9ybWF0LmJ5dGVzUGVyUGFja2V0ID0gKEBmb3JtYXQuYml0c1BlckNoYW5uZWwgLyA4KSAqIEBmb3JtYXQuY2hhbm5lbHNQZXJGcmFtZVxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgQGVtaXQgJ2Zvcm1hdCcsIEBmb3JtYXRcblxuICAgICAgICAgICAgICAgICAgICAjIEFkdmFuY2UgdG8gdGhlIG5leHQgY2h1bmtcbiAgICAgICAgICAgICAgICAgICAgQHN0cmVhbS5hZHZhbmNlKEBsZW4gLSAxNilcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgd2hlbiAnZGF0YSdcbiAgICAgICAgICAgICAgICAgICAgaWYgbm90IEBzZW50RHVyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIGJ5dGVzID0gQGZvcm1hdC5iaXRzUGVyQ2hhbm5lbCAvIDhcbiAgICAgICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkdXJhdGlvbicsIEBsZW4gLyBieXRlcyAvIEBmb3JtYXQuY2hhbm5lbHNQZXJGcmFtZSAvIEBmb3JtYXQuc2FtcGxlUmF0ZSAqIDEwMDAgfCAwXG4gICAgICAgICAgICAgICAgICAgICAgICBAc2VudER1cmF0aW9uID0gdHJ1ZVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBidWZmZXIgPSBAc3RyZWFtLnJlYWRTaW5nbGVCdWZmZXIoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgQGxlbiAtPSBidWZmZXIubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIEByZWFkSGVhZGVycyA9IEBsZW4gPiAwXG4gICAgICAgICAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmZmVyXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVubGVzcyBAc3RyZWFtLmF2YWlsYWJsZShAbGVuKVxuICAgICAgICAgICAgICAgICAgICBAc3RyZWFtLmFkdmFuY2UoQGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQHJlYWRIZWFkZXJzID0gZmFsc2UgdW5sZXNzIEB0eXBlIGlzICdkYXRhJ1xuICAgICAgICAgICAgXG4gICAgICAgIHJldHVybiIsIiNcbiMgVGhlIEF1ZGlvRGV2aWNlIGNsYXNzIGlzIHJlc3BvbnNpYmxlIGZvciBpbnRlcmZhY2luZyB3aXRoIHZhcmlvdXMgYXVkaW9cbiMgQVBJcyBpbiBicm93c2VycywgYW5kIGZvciBrZWVwaW5nIHRyYWNrIG9mIHRoZSBjdXJyZW50IHBsYXliYWNrIHRpbWVcbiMgYmFzZWQgb24gdGhlIGRldmljZSBoYXJkd2FyZSB0aW1lIGFuZCB0aGUgcGxheS9wYXVzZS9zZWVrIHN0YXRlXG4jXG5cbkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4vY29yZS9ldmVudHMnXG5cbmNsYXNzIEF1ZGlvRGV2aWNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyXG4gICAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGNoYW5uZWxzKSAtPlxuICAgICAgICBAcGxheWluZyA9IGZhbHNlXG4gICAgICAgIEBjdXJyZW50VGltZSA9IDBcbiAgICAgICAgQF9sYXN0VGltZSA9IDBcbiAgICAgICAgXG4gICAgc3RhcnQ6IC0+XG4gICAgICAgIHJldHVybiBpZiBAcGxheWluZ1xuICAgICAgICBAcGxheWluZyA9IHRydWVcbiAgICAgICAgXG4gICAgICAgIEBkZXZpY2UgPz0gQXVkaW9EZXZpY2UuY3JlYXRlKEBzYW1wbGVSYXRlLCBAY2hhbm5lbHMpXG4gICAgICAgIHVubGVzcyBAZGV2aWNlXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJObyBzdXBwb3J0ZWQgYXVkaW8gZGV2aWNlIGZvdW5kLlwiXG4gICAgICAgICAgICBcbiAgICAgICAgQF9sYXN0VGltZSA9IEBkZXZpY2UuZ2V0RGV2aWNlVGltZSgpXG4gICAgICAgICAgICBcbiAgICAgICAgQF90aW1lciA9IHNldEludGVydmFsIEB1cGRhdGVUaW1lLCAyMDBcbiAgICAgICAgQGRldmljZS5vbiAncmVmaWxsJywgQHJlZmlsbCA9IChidWZmZXIpID0+XG4gICAgICAgICAgICBAZW1pdCAncmVmaWxsJywgYnVmZmVyXG4gICAgICAgIFxuICAgIHN0b3A6IC0+XG4gICAgICAgIHJldHVybiB1bmxlc3MgQHBsYXlpbmdcbiAgICAgICAgQHBsYXlpbmcgPSBmYWxzZVxuICAgICAgICBcbiAgICAgICAgQGRldmljZS5vZmYgJ3JlZmlsbCcsIEByZWZpbGxcbiAgICAgICAgY2xlYXJJbnRlcnZhbCBAX3RpbWVyXG4gICAgICAgIFxuICAgIGRlc3Ryb3k6IC0+XG4gICAgICAgIEBzdG9wKClcbiAgICAgICAgQGRldmljZT8uZGVzdHJveSgpXG4gICAgICAgIFxuICAgIHNlZWs6IChAY3VycmVudFRpbWUpIC0+XG4gICAgICAgIEBfbGFzdFRpbWUgPSBAZGV2aWNlLmdldERldmljZVRpbWUoKSBpZiBAcGxheWluZ1xuICAgICAgICBAZW1pdCAndGltZVVwZGF0ZScsIEBjdXJyZW50VGltZVxuICAgICAgICBcbiAgICB1cGRhdGVUaW1lOiA9PlxuICAgICAgICB0aW1lID0gQGRldmljZS5nZXREZXZpY2VUaW1lKClcbiAgICAgICAgQGN1cnJlbnRUaW1lICs9ICh0aW1lIC0gQF9sYXN0VGltZSkgLyBAZGV2aWNlLnNhbXBsZVJhdGUgKiAxMDAwIHwgMFxuICAgICAgICBAX2xhc3RUaW1lID0gdGltZVxuICAgICAgICBAZW1pdCAndGltZVVwZGF0ZScsIEBjdXJyZW50VGltZVxuICAgICAgICBcbiAgICBkZXZpY2VzID0gW11cbiAgICBAcmVnaXN0ZXI6IChkZXZpY2UpIC0+XG4gICAgICAgIGRldmljZXMucHVzaChkZXZpY2UpXG5cbiAgICBAY3JlYXRlOiAoc2FtcGxlUmF0ZSwgY2hhbm5lbHMpIC0+XG4gICAgICAgIGZvciBkZXZpY2UgaW4gZGV2aWNlcyB3aGVuIGRldmljZS5zdXBwb3J0ZWRcbiAgICAgICAgICAgIHJldHVybiBuZXcgZGV2aWNlKHNhbXBsZVJhdGUsIGNoYW5uZWxzKVxuXG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICAgIFxubW9kdWxlLmV4cG9ydHMgPSBBdWRpb0RldmljZVxuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vY29yZS9ldmVudHMnXG5BdWRpb0RldmljZSA9IHJlcXVpcmUgJy4uL2RldmljZSdcbkFWQnVmZmVyID0gcmVxdWlyZSAnLi4vY29yZS9idWZmZXInXG5cbmNsYXNzIE1vemlsbGFBdWRpb0RldmljZSBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIEF1ZGlvRGV2aWNlLnJlZ2lzdGVyKE1vemlsbGFBdWRpb0RldmljZSlcbiAgICBcbiAgICAjIGRldGVybWluZSB3aGV0aGVyIHRoaXMgZGV2aWNlIGlzIHN1cHBvcnRlZCBieSB0aGUgYnJvd3NlclxuICAgIEBzdXBwb3J0ZWQ6IEF1ZGlvPyBhbmQgJ21veldyaXRlQXVkaW8nIG9mIG5ldyBBdWRpb1xuICAgIFxuICAgIGNvbnN0cnVjdG9yOiAoQHNhbXBsZVJhdGUsIEBjaGFubmVscykgLT4gICAgICAgIFxuICAgICAgICBAYXVkaW8gPSBuZXcgQXVkaW9cbiAgICAgICAgQGF1ZGlvLm1velNldHVwKEBjaGFubmVscywgQHNhbXBsZVJhdGUpXG4gICAgICAgIFxuICAgICAgICBAd3JpdGVQb3NpdGlvbiA9IDBcbiAgICAgICAgQHByZWJ1ZmZlclNpemUgPSBAc2FtcGxlUmF0ZSAvIDJcbiAgICAgICAgQHRhaWwgPSBudWxsXG4gICAgICAgIFxuICAgICAgICBAdGltZXIgPSBjcmVhdGVUaW1lciBAcmVmaWxsLCAxMDBcbiAgICAgICAgXG4gICAgcmVmaWxsOiA9PlxuICAgICAgICBpZiBAdGFpbFxuICAgICAgICAgICAgd3JpdHRlbiA9IEBhdWRpby5tb3pXcml0ZUF1ZGlvKEB0YWlsKVxuICAgICAgICAgICAgQHdyaXRlUG9zaXRpb24gKz0gd3JpdHRlblxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiBAd3JpdGVQb3NpdGlvbiA8IEB0YWlsLmxlbmd0aFxuICAgICAgICAgICAgICAgIEB0YWlsID0gQHRhaWwuc3ViYXJyYXkod3JpdHRlbilcbiAgICAgICAgICAgIGVsc2UgICAgXG4gICAgICAgICAgICAgICAgQHRhaWwgPSBudWxsXG4gICAgICAgICAgICBcbiAgICAgICAgY3VycmVudFBvc2l0aW9uID0gQGF1ZGlvLm1vekN1cnJlbnRTYW1wbGVPZmZzZXQoKVxuICAgICAgICBhdmFpbGFibGUgPSBjdXJyZW50UG9zaXRpb24gKyBAcHJlYnVmZmVyU2l6ZSAtIEB3cml0ZVBvc2l0aW9uXG4gICAgICAgIGlmIGF2YWlsYWJsZSA+IDBcbiAgICAgICAgICAgIGJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkoYXZhaWxhYmxlKVxuICAgICAgICAgICAgQGVtaXQgJ3JlZmlsbCcsIGJ1ZmZlclxuICAgICAgICAgICAgXG4gICAgICAgICAgICB3cml0dGVuID0gQGF1ZGlvLm1veldyaXRlQXVkaW8oYnVmZmVyKVxuICAgICAgICAgICAgaWYgd3JpdHRlbiA8IGJ1ZmZlci5sZW5ndGhcbiAgICAgICAgICAgICAgICBAdGFpbCA9IGJ1ZmZlci5zdWJhcnJheSh3cml0dGVuKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQHdyaXRlUG9zaXRpb24gKz0gd3JpdHRlblxuICAgICAgICAgICAgXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbiAgICBkZXN0cm95OiAtPlxuICAgICAgICBkZXN0cm95VGltZXIgQHRpbWVyXG4gICAgICAgIFxuICAgIGdldERldmljZVRpbWU6IC0+XG4gICAgICAgIHJldHVybiBAYXVkaW8ubW96Q3VycmVudFNhbXBsZU9mZnNldCgpIC8gQGNoYW5uZWxzXG4gICAgXG4gICAgIyBVc2UgYW4gaW5saW5lIHdvcmtlciB0byBnZXQgc2V0SW50ZXJ2YWxcbiAgICAjIHdpdGhvdXQgYmVpbmcgY2xhbXBlZCBpbiBiYWNrZ3JvdW5kIHRhYnNcbiAgICBjcmVhdGVUaW1lciA9IChmbiwgaW50ZXJ2YWwpIC0+XG4gICAgICAgIHVybCA9IEFWQnVmZmVyLm1ha2VCbG9iVVJMKFwic2V0SW50ZXJ2YWwoZnVuY3Rpb24oKSB7IHBvc3RNZXNzYWdlKCdwaW5nJyk7IH0sICN7aW50ZXJ2YWx9KTtcIilcbiAgICAgICAgcmV0dXJuIHNldEludGVydmFsIGZuLCBpbnRlcnZhbCB1bmxlc3MgdXJsP1xuICAgICAgICAgICAgICAgIFxuICAgICAgICB3b3JrZXIgPSBuZXcgV29ya2VyKHVybClcbiAgICAgICAgd29ya2VyLm9ubWVzc2FnZSA9IGZuXG4gICAgICAgIHdvcmtlci51cmwgPSB1cmxcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB3b3JrZXJcbiAgICAgICAgXG4gICAgZGVzdHJveVRpbWVyID0gKHRpbWVyKSAtPlxuICAgICAgICBpZiB0aW1lci50ZXJtaW5hdGVcbiAgICAgICAgICAgIHRpbWVyLnRlcm1pbmF0ZSgpXG4gICAgICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHRpbWVyLnVybClcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCB0aW1lciIsIi8vSmF2YVNjcmlwdCBBdWRpbyBSZXNhbXBsZXJcbi8vQ29weXJpZ2h0IChDKSAyMDExLTIwMTUgR3JhbnQgR2FsaXR6XG4vL1JlbGVhc2VkIHRvIFB1YmxpYyBEb21haW5cbmZ1bmN0aW9uIFJlc2FtcGxlcihmcm9tU2FtcGxlUmF0ZSwgdG9TYW1wbGVSYXRlLCBjaGFubmVscywgaW5wdXRCdWZmZXJMZW5ndGgpIHtcbiAgdGhpcy5mcm9tU2FtcGxlUmF0ZSA9ICtmcm9tU2FtcGxlUmF0ZTtcbiAgdGhpcy50b1NhbXBsZVJhdGUgPSArdG9TYW1wbGVSYXRlO1xuICB0aGlzLmNoYW5uZWxzID0gY2hhbm5lbHMgfCAwO1xuICB0aGlzLmlucHV0QnVmZmVyTGVuZ3RoID0gaW5wdXRCdWZmZXJMZW5ndGg7XG4gIHRoaXMuaW5pdGlhbGl6ZSgpO1xufVxuXG5SZXNhbXBsZXIucHJvdG90eXBlLmluaXRpYWxpemUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vUGVyZm9ybSBzb21lIGNoZWNrczpcbiAgaWYgKHRoaXMuZnJvbVNhbXBsZVJhdGUgPiAwICYmIHRoaXMudG9TYW1wbGVSYXRlID4gMCAmJiB0aGlzLmNoYW5uZWxzID4gMCkge1xuICAgIGlmICh0aGlzLmZyb21TYW1wbGVSYXRlID09IHRoaXMudG9TYW1wbGVSYXRlKSB7XG4gICAgICAvL1NldHVwIGEgcmVzYW1wbGVyIGJ5cGFzczpcbiAgICAgIHRoaXMucmVzYW1wbGVyID0gdGhpcy5ieXBhc3NSZXNhbXBsZXI7ICAgIC8vUmVzYW1wbGVyIGp1c3QgcmV0dXJucyB3aGF0IHdhcyBwYXNzZWQgdGhyb3VnaC5cbiAgICAgIHRoaXMucmF0aW9XZWlnaHQgPSAxO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJhdGlvV2VpZ2h0ID0gdGhpcy5mcm9tU2FtcGxlUmF0ZSAvIHRoaXMudG9TYW1wbGVSYXRlO1xuICAgICAgaWYgKHRoaXMuZnJvbVNhbXBsZVJhdGUgPCB0aGlzLnRvU2FtcGxlUmF0ZSkge1xuICAgICAgICAvKlxuICAgICAgICAgIFVzZSBnZW5lcmljIGxpbmVhciBpbnRlcnBvbGF0aW9uIGlmIHVwc2FtcGxpbmcsXG4gICAgICAgICAgYXMgbGluZWFyIGludGVycG9sYXRpb24gcHJvZHVjZXMgYSBncmFkaWVudCB0aGF0IHdlIHdhbnRcbiAgICAgICAgICBhbmQgd29ya3MgZmluZSB3aXRoIHR3byBpbnB1dCBzYW1wbGUgcG9pbnRzIHBlciBvdXRwdXQgaW4gdGhpcyBjYXNlLlxuICAgICAgICAqL1xuICAgICAgICB0aGlzLmNvbXBpbGVMaW5lYXJJbnRlcnBvbGF0aW9uRnVuY3Rpb24oKTtcbiAgICAgICAgdGhpcy5sYXN0V2VpZ2h0ID0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8qXG4gICAgICAgICAgQ3VzdG9tIHJlc2FtcGxlciBJIHdyb3RlIHRoYXQgZG9lc24ndCBza2lwIHNhbXBsZXNcbiAgICAgICAgICBsaWtlIHN0YW5kYXJkIGxpbmVhciBpbnRlcnBvbGF0aW9uIGluIGhpZ2ggZG93bnNhbXBsaW5nLlxuICAgICAgICAgIFRoaXMgaXMgbW9yZSBhY2N1cmF0ZSB0aGFuIGxpbmVhciBpbnRlcnBvbGF0aW9uIG9uIGRvd25zYW1wbGluZy5cbiAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jb21waWxlTXVsdGlUYXBGdW5jdGlvbigpO1xuICAgICAgICB0aGlzLnRhaWxFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5sYXN0V2VpZ2h0ID0gMDtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdmFyIG91dHB1dEJ1ZmZlclNpemUgPSAoTWF0aC5jZWlsKHRoaXMuaW5wdXRCdWZmZXJMZW5ndGggKiB0aGlzLnRvU2FtcGxlUmF0ZSAvIHRoaXMuZnJvbVNhbXBsZVJhdGUgLyB0aGlzLmNoYW5uZWxzICogMS4wMSkgKiB0aGlzLmNoYW5uZWxzKSArIHRoaXMuY2hhbm5lbHM7XG4gICAgICB0aGlzLm91dHB1dEJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkob3V0cHV0QnVmZmVyU2l6ZSk7XG4gICAgICB0aGlzLmxhc3RPdXRwdXQgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuY2hhbm5lbHMpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyhuZXcgRXJyb3IoXCJJbnZhbGlkIHNldHRpbmdzIHNwZWNpZmllZCBmb3IgdGhlIHJlc2FtcGxlci5cIikpO1xuICB9XG59O1xuXG5SZXNhbXBsZXIucHJvdG90eXBlLmNvbXBpbGVMaW5lYXJJbnRlcnBvbGF0aW9uRnVuY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciB0b0NvbXBpbGUgPSBcInZhciBvdXRwdXRPZmZzZXQgPSAwO1xcXG4gICAgdmFyIGJ1ZmZlckxlbmd0aCA9IGJ1ZmZlci5sZW5ndGg7XFxcbiAgICBpZiAoYnVmZmVyTGVuZ3RoID4gMCkge1xcXG4gICAgICB2YXIgd2VpZ2h0ID0gdGhpcy5sYXN0V2VpZ2h0O1xcXG4gICAgICB2YXIgZmlyc3RXZWlnaHQgPSAwO1xcXG4gICAgICB2YXIgc2Vjb25kV2VpZ2h0ID0gMDtcXFxuICAgICAgdmFyIHNvdXJjZU9mZnNldCA9IDA7XFxcbiAgICAgIHZhciBvdXRwdXRPZmZzZXQgPSAwO1xcXG4gICAgICB2YXIgb3V0cHV0QnVmZmVyID0gdGhpcy5vdXRwdXRCdWZmZXI7XFxcbiAgICAgIGZvciAoOyB3ZWlnaHQgPCAxOyB3ZWlnaHQgKz0gXCIgKyB0aGlzLnJhdGlvV2VpZ2h0ICsgXCIpIHtcXFxuICAgICAgICBzZWNvbmRXZWlnaHQgPSB3ZWlnaHQgJSAxO1xcXG4gICAgICAgIGZpcnN0V2VpZ2h0ID0gMSAtIHNlY29uZFdlaWdodDtcIjtcbiAgICAgICAgZm9yICh2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCB0aGlzLmNoYW5uZWxzOyArK2NoYW5uZWwpIHtcbiAgICAgICAgICB0b0NvbXBpbGUgKz0gXCJvdXRwdXRCdWZmZXJbb3V0cHV0T2Zmc2V0KytdID0gKHRoaXMubGFzdE91dHB1dFtcIiArIGNoYW5uZWwgKyBcIl0gKiBmaXJzdFdlaWdodCkgKyAoYnVmZmVyW1wiICsgY2hhbm5lbCArIFwiXSAqIHNlY29uZFdlaWdodCk7XCI7XG4gICAgICAgIH1cbiAgICAgIHRvQ29tcGlsZSArPSBcIn1cXFxuICAgICAgd2VpZ2h0IC09IDE7XFxcbiAgICAgIGZvciAoYnVmZmVyTGVuZ3RoIC09IFwiICsgdGhpcy5jaGFubmVscyArIFwiLCBzb3VyY2VPZmZzZXQgPSBNYXRoLmZsb29yKHdlaWdodCkgKiBcIiArIHRoaXMuY2hhbm5lbHMgKyBcIjsgc291cmNlT2Zmc2V0IDwgYnVmZmVyTGVuZ3RoOykge1xcXG4gICAgICAgIHNlY29uZFdlaWdodCA9IHdlaWdodCAlIDE7XFxcbiAgICAgICAgZmlyc3RXZWlnaHQgPSAxIC0gc2Vjb25kV2VpZ2h0O1wiO1xuICAgICAgICBmb3IgKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuICAgICAgICAgIHRvQ29tcGlsZSArPSBcIm91dHB1dEJ1ZmZlcltvdXRwdXRPZmZzZXQrK10gPSAoYnVmZmVyW3NvdXJjZU9mZnNldFwiICsgKChjaGFubmVsID4gMCkgPyAoXCIgKyBcIiArIGNoYW5uZWwpIDogXCJcIikgKyBcIl0gKiBmaXJzdFdlaWdodCkgKyAoYnVmZmVyW3NvdXJjZU9mZnNldCArIFwiICsgKHRoaXMuY2hhbm5lbHMgKyBjaGFubmVsKSArIFwiXSAqIHNlY29uZFdlaWdodCk7XCI7XG4gICAgICAgIH1cbiAgICAgICAgdG9Db21waWxlICs9IFwid2VpZ2h0ICs9IFwiICsgdGhpcy5yYXRpb1dlaWdodCArIFwiO1xcXG4gICAgICAgIHNvdXJjZU9mZnNldCA9IE1hdGguZmxvb3Iod2VpZ2h0KSAqIFwiICsgdGhpcy5jaGFubmVscyArIFwiO1xcXG4gICAgICB9XCI7XG4gICAgICBmb3IgKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuICAgICAgICB0b0NvbXBpbGUgKz0gXCJ0aGlzLmxhc3RPdXRwdXRbXCIgKyBjaGFubmVsICsgXCJdID0gYnVmZmVyW3NvdXJjZU9mZnNldCsrXTtcIjtcbiAgICAgIH1cbiAgICAgIHRvQ29tcGlsZSArPSBcInRoaXMubGFzdFdlaWdodCA9IHdlaWdodCAlIDE7XFxcbiAgICB9XFxcbiAgICByZXR1cm4gdGhpcy5vdXRwdXRCdWZmZXI7XCI7XG4gICAgXG4gIHRoaXMucmVzYW1wbGVyID0gRnVuY3Rpb24oXCJidWZmZXJcIiwgdG9Db21waWxlKTtcbn07XG5cblJlc2FtcGxlci5wcm90b3R5cGUuY29tcGlsZU11bHRpVGFwRnVuY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciB0b0NvbXBpbGUgPSBcInZhciBvdXRwdXRPZmZzZXQgPSAwO1xcXG4gICAgdmFyIGJ1ZmZlckxlbmd0aCA9IGJ1ZmZlci5sZW5ndGg7XFxcbiAgICBpZiAoYnVmZmVyTGVuZ3RoID4gMCkge1xcXG4gICAgICB2YXIgd2VpZ2h0ID0gMDtcIjtcbiAgICAgIGZvciAodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG4gICAgICAgIHRvQ29tcGlsZSArPSBcInZhciBvdXRwdXRcIiArIGNoYW5uZWwgKyBcIiA9IDA7XCJcbiAgICAgIH1cbiAgICAgIHRvQ29tcGlsZSArPSBcInZhciBhY3R1YWxQb3NpdGlvbiA9IDA7XFxcbiAgICAgIHZhciBhbW91bnRUb05leHQgPSAwO1xcXG4gICAgICB2YXIgYWxyZWFkeVByb2Nlc3NlZFRhaWwgPSAhdGhpcy50YWlsRXhpc3RzO1xcXG4gICAgICB0aGlzLnRhaWxFeGlzdHMgPSBmYWxzZTtcXFxuICAgICAgdmFyIG91dHB1dEJ1ZmZlciA9IHRoaXMub3V0cHV0QnVmZmVyO1xcXG4gICAgICB2YXIgY3VycmVudFBvc2l0aW9uID0gMDtcXFxuICAgICAgZG8ge1xcXG4gICAgICAgIGlmIChhbHJlYWR5UHJvY2Vzc2VkVGFpbCkge1xcXG4gICAgICAgICAgd2VpZ2h0ID0gXCIgKyB0aGlzLnJhdGlvV2VpZ2h0ICsgXCI7XCI7XG4gICAgICAgICAgZm9yIChjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuICAgICAgICAgICAgdG9Db21waWxlICs9IFwib3V0cHV0XCIgKyBjaGFubmVsICsgXCIgPSAwO1wiXG4gICAgICAgICAgfVxuICAgICAgICB0b0NvbXBpbGUgKz0gXCJ9XFxcbiAgICAgICAgZWxzZSB7XFxcbiAgICAgICAgICB3ZWlnaHQgPSB0aGlzLmxhc3RXZWlnaHQ7XCI7XG4gICAgICAgICAgZm9yIChjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuICAgICAgICAgICAgdG9Db21waWxlICs9IFwib3V0cHV0XCIgKyBjaGFubmVsICsgXCIgPSB0aGlzLmxhc3RPdXRwdXRbXCIgKyBjaGFubmVsICsgXCJdO1wiXG4gICAgICAgICAgfVxuICAgICAgICAgIHRvQ29tcGlsZSArPSBcImFscmVhZHlQcm9jZXNzZWRUYWlsID0gdHJ1ZTtcXFxuICAgICAgICB9XFxcbiAgICAgICAgd2hpbGUgKHdlaWdodCA+IDAgJiYgYWN0dWFsUG9zaXRpb24gPCBidWZmZXJMZW5ndGgpIHtcXFxuICAgICAgICAgIGFtb3VudFRvTmV4dCA9IDEgKyBhY3R1YWxQb3NpdGlvbiAtIGN1cnJlbnRQb3NpdGlvbjtcXFxuICAgICAgICAgIGlmICh3ZWlnaHQgPj0gYW1vdW50VG9OZXh0KSB7XCI7XG4gICAgICAgICAgICBmb3IgKGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgdGhpcy5jaGFubmVsczsgKytjaGFubmVsKSB7XG4gICAgICAgICAgICAgIHRvQ29tcGlsZSArPSBcIm91dHB1dFwiICsgY2hhbm5lbCArIFwiICs9IGJ1ZmZlclthY3R1YWxQb3NpdGlvbisrXSAqIGFtb3VudFRvTmV4dDtcIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9Db21waWxlICs9IFwiY3VycmVudFBvc2l0aW9uID0gYWN0dWFsUG9zaXRpb247XFxcbiAgICAgICAgICAgIHdlaWdodCAtPSBhbW91bnRUb05leHQ7XFxcbiAgICAgICAgICB9XFxcbiAgICAgICAgICBlbHNlIHtcIjtcbiAgICAgICAgICAgIGZvciAoY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCB0aGlzLmNoYW5uZWxzOyArK2NoYW5uZWwpIHtcbiAgICAgICAgICAgICAgdG9Db21waWxlICs9IFwib3V0cHV0XCIgKyBjaGFubmVsICsgXCIgKz0gYnVmZmVyW2FjdHVhbFBvc2l0aW9uXCIgKyAoKGNoYW5uZWwgPiAwKSA/IChcIiArIFwiICsgY2hhbm5lbCkgOiBcIlwiKSArIFwiXSAqIHdlaWdodDtcIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9Db21waWxlICs9IFwiY3VycmVudFBvc2l0aW9uICs9IHdlaWdodDtcXFxuICAgICAgICAgICAgd2VpZ2h0ID0gMDtcXFxuICAgICAgICAgICAgYnJlYWs7XFxcbiAgICAgICAgICB9XFxcbiAgICAgICAgfVxcXG4gICAgICAgIGlmICh3ZWlnaHQgPD0gMCkge1wiO1xuICAgICAgICAgIGZvciAoY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCB0aGlzLmNoYW5uZWxzOyArK2NoYW5uZWwpIHtcbiAgICAgICAgICAgIHRvQ29tcGlsZSArPSBcIm91dHB1dEJ1ZmZlcltvdXRwdXRPZmZzZXQrK10gPSBvdXRwdXRcIiArIGNoYW5uZWwgKyBcIiAvIFwiICsgdGhpcy5yYXRpb1dlaWdodCArIFwiO1wiXG4gICAgICAgICAgfVxuICAgICAgICB0b0NvbXBpbGUgKz0gXCJ9XFxcbiAgICAgICAgZWxzZSB7XFxcbiAgICAgICAgICB0aGlzLmxhc3RXZWlnaHQgPSB3ZWlnaHQ7XCI7XG4gICAgICAgICAgZm9yIChjaGFubmVsID0gMDsgY2hhbm5lbCA8IHRoaXMuY2hhbm5lbHM7ICsrY2hhbm5lbCkge1xuICAgICAgICAgICAgdG9Db21waWxlICs9IFwidGhpcy5sYXN0T3V0cHV0W1wiICsgY2hhbm5lbCArIFwiXSA9IG91dHB1dFwiICsgY2hhbm5lbCArIFwiO1wiXG4gICAgICAgICAgfVxuICAgICAgICAgIHRvQ29tcGlsZSArPSBcInRoaXMudGFpbEV4aXN0cyA9IHRydWU7XFxcbiAgICAgICAgICBicmVhaztcXFxuICAgICAgICB9XFxcbiAgICAgIH0gd2hpbGUgKGFjdHVhbFBvc2l0aW9uIDwgYnVmZmVyTGVuZ3RoKTtcXFxuICAgIH1cXFxuICAgIHJldHVybiB0aGlzLm91dHB1dEJ1ZmZlcjtcIjtcbiAgXG4gIHRoaXMucmVzYW1wbGVyID0gRnVuY3Rpb24oXCJidWZmZXJcIiwgdG9Db21waWxlKTtcbn07XG5cblJlc2FtcGxlci5wcm90b3R5cGUuYnlwYXNzUmVzYW1wbGVyID0gZnVuY3Rpb24gKGlucHV0QnVmZmVyKSB7XG4gIHJldHVybiBpbnB1dEJ1ZmZlcjtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzYW1wbGVyO1xuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vY29yZS9ldmVudHMnXG5BdWRpb0RldmljZSA9IHJlcXVpcmUgJy4uL2RldmljZSdcblJlc2FtcGxlciA9IHJlcXVpcmUgJy4vcmVzYW1wbGVyJ1xuXG5jbGFzcyBXZWJBdWRpb0RldmljZSBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIEF1ZGlvRGV2aWNlLnJlZ2lzdGVyKFdlYkF1ZGlvRGV2aWNlKVxuICAgIFxuICAgICMgZGV0ZXJtaW5lIHdoZXRoZXIgdGhpcyBkZXZpY2UgaXMgc3VwcG9ydGVkIGJ5IHRoZSBicm93c2VyXG4gICAgQXVkaW9Db250ZXh0ID0gZ2xvYmFsLkF1ZGlvQ29udGV4dCBvciBnbG9iYWwud2Via2l0QXVkaW9Db250ZXh0XG4gICAgQHN1cHBvcnRlZCA9IEF1ZGlvQ29udGV4dCBhbmQgXG4gICAgICAodHlwZW9mIEF1ZGlvQ29udGV4dDo6W2NyZWF0ZVByb2Nlc3NvciA9ICdjcmVhdGVTY3JpcHRQcm9jZXNzb3InXSBpcyAnZnVuY3Rpb24nIG9yXG4gICAgICB0eXBlb2YgQXVkaW9Db250ZXh0OjpbY3JlYXRlUHJvY2Vzc29yID0gJ2NyZWF0ZUphdmFTY3JpcHROb2RlJ10gIGlzICdmdW5jdGlvbicpXG4gICAgXG4gICAgIyBDaHJvbWUgbGltaXRzIHRoZSBudW1iZXIgb2YgQXVkaW9Db250ZXh0cyB0aGF0IG9uZSBjYW4gY3JlYXRlLFxuICAgICMgc28gdXNlIGEgbGF6aWx5IGNyZWF0ZWQgc2hhcmVkIGNvbnRleHQgZm9yIGFsbCBwbGF5YmFja1xuICAgIHNoYXJlZENvbnRleHQgPSBudWxsXG4gICAgXG4gICAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGNoYW5uZWxzKSAtPlxuICAgICAgICBAY29udGV4dCA9IHNoYXJlZENvbnRleHQgPz0gbmV3IEF1ZGlvQ29udGV4dFxuICAgICAgICBAZGV2aWNlU2FtcGxlUmF0ZSA9IEBjb250ZXh0LnNhbXBsZVJhdGVcbiAgICAgICAgXG4gICAgICAgICMgY2FsY3VsYXRlIHRoZSBidWZmZXIgc2l6ZSB0byByZWFkXG4gICAgICAgIEBidWZmZXJTaXplID0gTWF0aC5jZWlsKDQwOTYgLyAoQGRldmljZVNhbXBsZVJhdGUgLyBAc2FtcGxlUmF0ZSkgKiBAY2hhbm5lbHMpXG4gICAgICAgIEBidWZmZXJTaXplICs9IEBidWZmZXJTaXplICUgQGNoYW5uZWxzXG4gICAgICAgIFxuICAgICAgICAjIGlmIHRoZSBzYW1wbGUgcmF0ZSBkb2Vzbid0IG1hdGNoIHRoZSBoYXJkd2FyZSBzYW1wbGUgcmF0ZSwgY3JlYXRlIGEgcmVzYW1wbGVyXG4gICAgICAgIGlmIEBkZXZpY2VTYW1wbGVSYXRlIGlzbnQgQHNhbXBsZVJhdGVcbiAgICAgICAgICAgIEByZXNhbXBsZXIgPSBuZXcgUmVzYW1wbGVyKEBzYW1wbGVSYXRlLCBAZGV2aWNlU2FtcGxlUmF0ZSwgQGNoYW5uZWxzLCBAYnVmZmVyU2l6ZSlcblxuICAgICAgICBAbm9kZSA9IEBjb250ZXh0W2NyZWF0ZVByb2Nlc3Nvcl0oNDA5NiwgQGNoYW5uZWxzLCBAY2hhbm5lbHMpXG4gICAgICAgIEBub2RlLm9uYXVkaW9wcm9jZXNzID0gQHJlZmlsbFxuICAgICAgICBAbm9kZS5jb25uZWN0KEBjb250ZXh0LmRlc3RpbmF0aW9uKVxuICAgICAgICBcbiAgICByZWZpbGw6IChldmVudCkgPT5cbiAgICAgICAgb3V0cHV0QnVmZmVyID0gZXZlbnQub3V0cHV0QnVmZmVyXG4gICAgICAgIGNoYW5uZWxDb3VudCA9IG91dHB1dEJ1ZmZlci5udW1iZXJPZkNoYW5uZWxzXG4gICAgICAgIGNoYW5uZWxzID0gbmV3IEFycmF5KGNoYW5uZWxDb3VudClcbiAgICAgICAgXG4gICAgICAgICMgZ2V0IG91dHB1dCBjaGFubmVsc1xuICAgICAgICBmb3IgaSBpbiBbMC4uLmNoYW5uZWxDb3VudF0gYnkgMVxuICAgICAgICAgICAgY2hhbm5lbHNbaV0gPSBvdXRwdXRCdWZmZXIuZ2V0Q2hhbm5lbERhdGEoaSlcbiAgICAgICAgXG4gICAgICAgICMgZ2V0IGF1ZGlvIGRhdGEgICAgXG4gICAgICAgIGRhdGEgPSBuZXcgRmxvYXQzMkFycmF5KEBidWZmZXJTaXplKVxuICAgICAgICBAZW1pdCAncmVmaWxsJywgZGF0YVxuICAgICAgICBcbiAgICAgICAgIyByZXNhbXBsZSBpZiBuZWNlc3NhcnkgICAgXG4gICAgICAgIGlmIEByZXNhbXBsZXJcbiAgICAgICAgICAgIGRhdGEgPSBAcmVzYW1wbGVyLnJlc2FtcGxlcihkYXRhKVxuICAgICAgICBcbiAgICAgICAgIyB3cml0ZSBkYXRhIHRvIG91dHB1dFxuICAgICAgICBmb3IgaSBpbiBbMC4uLm91dHB1dEJ1ZmZlci5sZW5ndGhdIGJ5IDFcbiAgICAgICAgICAgIGZvciBuIGluIFswLi4uY2hhbm5lbENvdW50XSBieSAxXG4gICAgICAgICAgICAgICAgY2hhbm5lbHNbbl1baV0gPSBkYXRhW2kgKiBjaGFubmVsQ291bnQgKyBuXVxuICAgICAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG4gICAgZGVzdHJveTogLT5cbiAgICAgICAgQG5vZGUuZGlzY29ubmVjdCgwKVxuICAgICAgICBcbiAgICBnZXREZXZpY2VUaW1lOiAtPlxuICAgICAgICByZXR1cm4gQGNvbnRleHQuY3VycmVudFRpbWUgKiBAc2FtcGxlUmF0ZSIsImNsYXNzIEZpbHRlclxuICAgIGNvbnN0cnVjdG9yOiAoY29udGV4dCwga2V5KSAtPlxuICAgICAgICAjIGRlZmF1bHQgY29uc3RydWN0b3IgdGFrZXMgYSBzaW5nbGUgdmFsdWVcbiAgICAgICAgIyBvdmVycmlkZSB0byB0YWtlIG1vcmUgcGFyYW1ldGVyc1xuICAgICAgICBpZiBjb250ZXh0IGFuZCBrZXlcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSB0aGlzLCAndmFsdWUnLCBcbiAgICAgICAgICAgICAgICBnZXQ6IC0+IGNvbnRleHRba2V5XVxuICAgICAgICBcbiAgICBwcm9jZXNzOiAoYnVmZmVyKSAtPlxuICAgICAgICAjIG92ZXJyaWRlIHRoaXMgbWV0aG9kXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gRmlsdGVyXG4iLCJGaWx0ZXIgPSByZXF1aXJlICcuLi9maWx0ZXInXG5cbmNsYXNzIEJhbGFuY2VGaWx0ZXIgZXh0ZW5kcyBGaWx0ZXJcbiAgICBwcm9jZXNzOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gaWYgQHZhbHVlIGlzIDBcbiAgICAgICAgcGFuID0gTWF0aC5tYXgoLTUwLCBNYXRoLm1pbig1MCwgQHZhbHVlKSlcbiAgICAgICAgXG4gICAgICAgIGZvciBpIGluIFswLi4uYnVmZmVyLmxlbmd0aF0gYnkgMlxuICAgICAgICAgICAgYnVmZmVyW2ldICo9IE1hdGgubWluKDEsICg1MCAtIHBhbikgLyA1MClcbiAgICAgICAgICAgIGJ1ZmZlcltpICsgMV0gKj0gTWF0aC5taW4oMSwgKDUwICsgcGFuKSAvIDUwKVxuICAgICAgICAgICAgXG4gICAgICAgIHJldHVyblxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gQmFsYW5jZUZpbHRlclxuIiwiRmlsdGVyID0gcmVxdWlyZSAnLi4vZmlsdGVyJ1xuXG5jbGFzcyBWb2x1bWVGaWx0ZXIgZXh0ZW5kcyBGaWx0ZXJcbiAgICBwcm9jZXNzOiAoYnVmZmVyKSAtPlxuICAgICAgICByZXR1cm4gaWYgQHZhbHVlID49IDEwMFxuICAgICAgICB2b2wgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIEB2YWx1ZSkpIC8gMTAwXG4gICAgICAgIFxuICAgICAgICBmb3IgaSBpbiBbMC4uLmJ1ZmZlci5sZW5ndGhdIGJ5IDFcbiAgICAgICAgICAgIGJ1ZmZlcltpXSAqPSB2b2xcbiAgICAgICAgICAgIFxuICAgICAgICByZXR1cm5cbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IFZvbHVtZUZpbHRlclxuIiwiI1xuIyBUaGUgUGxheWVyIGNsYXNzIHBsYXlzIGJhY2sgYXVkaW8gZGF0YSBmcm9tIHZhcmlvdXMgc291cmNlc1xuIyBhcyBkZWNvZGVkIGJ5IHRoZSBBc3NldCBjbGFzcy4gIEluIGFkZGl0aW9uLCBpdCBoYW5kbGVzXG4jIGNvbW1vbiBhdWRpbyBmaWx0ZXJzIGxpa2UgcGFubmluZyBhbmQgdm9sdW1lIGFkanVzdG1lbnQsXG4jIGFuZCBpbnRlcmZhY2luZyB3aXRoIEF1ZGlvRGV2aWNlcyB0byBrZWVwIHRyYWNrIG9mIHRoZSBcbiMgcGxheWJhY2sgdGltZS5cbiNcblxuRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi9jb3JlL2V2ZW50cydcbkFzc2V0ID0gcmVxdWlyZSAnLi9hc3NldCdcblZvbHVtZUZpbHRlciA9IHJlcXVpcmUgJy4vZmlsdGVycy92b2x1bWUnXG5CYWxhbmNlRmlsdGVyID0gcmVxdWlyZSAnLi9maWx0ZXJzL2JhbGFuY2UnXG5RdWV1ZSA9IHJlcXVpcmUgJy4vcXVldWUnXG5BdWRpb0RldmljZSA9IHJlcXVpcmUgJy4vZGV2aWNlJ1xuXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJcbiAgICBjb25zdHJ1Y3RvcjogKEBhc3NldCkgLT5cbiAgICAgICAgQHBsYXlpbmcgPSBmYWxzZVxuICAgICAgICBAYnVmZmVyZWQgPSAwXG4gICAgICAgIEBjdXJyZW50VGltZSA9IDBcbiAgICAgICAgQGR1cmF0aW9uID0gMFxuICAgICAgICBAdm9sdW1lID0gMTAwXG4gICAgICAgIEBwYW4gPSAwICMgLTUwIGZvciBsZWZ0LCA1MCBmb3IgcmlnaHQsIDAgZm9yIGNlbnRlclxuICAgICAgICBAbWV0YWRhdGEgPSB7fVxuICAgICAgICBcbiAgICAgICAgQGZpbHRlcnMgPSBbXG4gICAgICAgICAgICBuZXcgVm9sdW1lRmlsdGVyKHRoaXMsICd2b2x1bWUnKVxuICAgICAgICAgICAgbmV3IEJhbGFuY2VGaWx0ZXIodGhpcywgJ3BhbicpXG4gICAgICAgIF1cbiAgICAgICAgXG4gICAgICAgIEBhc3NldC5vbiAnYnVmZmVyJywgKEBidWZmZXJlZCkgPT5cbiAgICAgICAgICAgIEBlbWl0ICdidWZmZXInLCBAYnVmZmVyZWRcbiAgICAgICAgXG4gICAgICAgIEBhc3NldC5vbiAnZGVjb2RlU3RhcnQnLCA9PlxuICAgICAgICAgICAgQHF1ZXVlID0gbmV3IFF1ZXVlKEBhc3NldClcbiAgICAgICAgICAgIEBxdWV1ZS5vbmNlICdyZWFkeScsIEBzdGFydFBsYXlpbmdcbiAgICAgICAgICAgIFxuICAgICAgICBAYXNzZXQub24gJ2Zvcm1hdCcsIChAZm9ybWF0KSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2Zvcm1hdCcsIEBmb3JtYXRcbiAgICAgICAgICAgIFxuICAgICAgICBAYXNzZXQub24gJ21ldGFkYXRhJywgKEBtZXRhZGF0YSkgPT5cbiAgICAgICAgICAgIEBlbWl0ICdtZXRhZGF0YScsIEBtZXRhZGF0YVxuICAgICAgICAgICAgXG4gICAgICAgIEBhc3NldC5vbiAnZHVyYXRpb24nLCAoQGR1cmF0aW9uKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2R1cmF0aW9uJywgQGR1cmF0aW9uXG4gICAgICAgICAgICBcbiAgICAgICAgQGFzc2V0Lm9uICdlcnJvcicsIChlcnJvcikgPT5cbiAgICAgICAgICAgIEBlbWl0ICdlcnJvcicsIGVycm9yXG4gICAgICAgICAgICAgICAgXG4gICAgQGZyb21VUkw6ICh1cmwsIG9wdHMpIC0+XG4gICAgICAgIHJldHVybiBuZXcgUGxheWVyIEFzc2V0LmZyb21VUkwodXJsLCBvcHRzKVxuICAgICAgICBcbiAgICBAZnJvbUZpbGU6IChmaWxlKSAtPlxuICAgICAgICByZXR1cm4gbmV3IFBsYXllciBBc3NldC5mcm9tRmlsZShmaWxlKVxuICAgICAgICBcbiAgICBAZnJvbUJ1ZmZlcjogKGJ1ZmZlcikgLT5cbiAgICAgICAgcmV0dXJuIG5ldyBQbGF5ZXIgQXNzZXQuZnJvbUJ1ZmZlcihidWZmZXIpXG4gICAgICAgIFxuICAgIHByZWxvYWQ6IC0+XG4gICAgICAgIHJldHVybiB1bmxlc3MgQGFzc2V0XG4gICAgICAgIFxuICAgICAgICBAc3RhcnRlZFByZWxvYWRpbmcgPSB0cnVlXG4gICAgICAgIEBhc3NldC5zdGFydChmYWxzZSlcbiAgICAgICAgXG4gICAgcGxheTogLT5cbiAgICAgICAgcmV0dXJuIGlmIEBwbGF5aW5nXG4gICAgICAgIFxuICAgICAgICB1bmxlc3MgQHN0YXJ0ZWRQcmVsb2FkaW5nXG4gICAgICAgICAgICBAcHJlbG9hZCgpXG4gICAgICAgIFxuICAgICAgICBAcGxheWluZyA9IHRydWVcbiAgICAgICAgQGRldmljZT8uc3RhcnQoKVxuICAgICAgICBcbiAgICBwYXVzZTogLT5cbiAgICAgICAgcmV0dXJuIHVubGVzcyBAcGxheWluZ1xuICAgICAgICBcbiAgICAgICAgQHBsYXlpbmcgPSBmYWxzZVxuICAgICAgICBAZGV2aWNlPy5zdG9wKClcbiAgICAgICAgXG4gICAgdG9nZ2xlUGxheWJhY2s6IC0+XG4gICAgICAgIGlmIEBwbGF5aW5nXG4gICAgICAgICAgICBAcGF1c2UoKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAcGxheSgpXG4gICAgICAgIFxuICAgIHN0b3A6IC0+XG4gICAgICAgIEBwYXVzZSgpXG4gICAgICAgIEBhc3NldC5zdG9wKClcbiAgICAgICAgQGRldmljZT8uZGVzdHJveSgpXG4gICAgICAgIFxuICAgIHNlZWs6ICh0aW1lc3RhbXApIC0+XG4gICAgICAgIEBkZXZpY2U/LnN0b3AoKVxuICAgICAgICBAcXVldWUub25jZSAncmVhZHknLCA9PlxuICAgICAgICAgICAgQGRldmljZT8uc2VlayBAY3VycmVudFRpbWVcbiAgICAgICAgICAgIEBkZXZpY2U/LnN0YXJ0KCkgaWYgQHBsYXlpbmdcbiAgICAgICAgICAgIFxuICAgICAgICAjIGNvbnZlcnQgdGltZXN0YW1wIHRvIHNhbXBsZSBudW1iZXJcbiAgICAgICAgdGltZXN0YW1wID0gKHRpbWVzdGFtcCAvIDEwMDApICogQGZvcm1hdC5zYW1wbGVSYXRlXG4gICAgICAgICAgICBcbiAgICAgICAgIyB0aGUgYWN0dWFsIHRpbWVzdGFtcCB3ZSBzZWVrZWQgdG8gbWF5IGRpZmZlciBcbiAgICAgICAgIyBmcm9tIHRoZSByZXF1ZXN0ZWQgdGltZXN0YW1wIGR1ZSB0byBvcHRpbWl6YXRpb25zXG4gICAgICAgIHRpbWVzdGFtcCA9IEBhc3NldC5kZWNvZGVyLnNlZWsodGltZXN0YW1wKVxuICAgICAgICBcbiAgICAgICAgIyBjb252ZXJ0IGJhY2sgZnJvbSBzYW1wbGVzIHRvIG1pbGxpc2Vjb25kc1xuICAgICAgICBAY3VycmVudFRpbWUgPSB0aW1lc3RhbXAgLyBAZm9ybWF0LnNhbXBsZVJhdGUgKiAxMDAwIHwgMFxuICAgICAgICBcbiAgICAgICAgQHF1ZXVlLnJlc2V0KClcbiAgICAgICAgcmV0dXJuIEBjdXJyZW50VGltZVxuICAgICAgICBcbiAgICBzdGFydFBsYXlpbmc6ID0+XG4gICAgICAgIGZyYW1lID0gQHF1ZXVlLnJlYWQoKVxuICAgICAgICBmcmFtZU9mZnNldCA9IDBcbiAgICAgICAgXG4gICAgICAgIEBkZXZpY2UgPSBuZXcgQXVkaW9EZXZpY2UoQGZvcm1hdC5zYW1wbGVSYXRlLCBAZm9ybWF0LmNoYW5uZWxzUGVyRnJhbWUpXG4gICAgICAgIEBkZXZpY2Uub24gJ3RpbWVVcGRhdGUnLCAoQGN1cnJlbnRUaW1lKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ3Byb2dyZXNzJywgQGN1cnJlbnRUaW1lXG4gICAgICAgIFxuICAgICAgICBAcmVmaWxsID0gKGJ1ZmZlcikgPT5cbiAgICAgICAgICAgIHJldHVybiB1bmxlc3MgQHBsYXlpbmdcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyB0cnkgcmVhZGluZyBhbm90aGVyIGZyYW1lIGlmIG9uZSBpc24ndCBhbHJlYWR5IGF2YWlsYWJsZVxuICAgICAgICAgICAgIyBoYXBwZW5zIHdoZW4gd2UgcGxheSB0byB0aGUgZW5kIGFuZCB0aGVuIHNlZWsgYmFja1xuICAgICAgICAgICAgaWYgbm90IGZyYW1lXG4gICAgICAgICAgICAgICAgZnJhbWUgPSBAcXVldWUucmVhZCgpXG4gICAgICAgICAgICAgICAgZnJhbWVPZmZzZXQgPSAwXG5cbiAgICAgICAgICAgIGJ1ZmZlck9mZnNldCA9IDBcbiAgICAgICAgICAgIHdoaWxlIGZyYW1lIGFuZCBidWZmZXJPZmZzZXQgPCBidWZmZXIubGVuZ3RoXG4gICAgICAgICAgICAgICAgbWF4ID0gTWF0aC5taW4oZnJhbWUubGVuZ3RoIC0gZnJhbWVPZmZzZXQsIGJ1ZmZlci5sZW5ndGggLSBidWZmZXJPZmZzZXQpXG4gICAgICAgICAgICAgICAgZm9yIGkgaW4gWzAuLi5tYXhdIGJ5IDFcbiAgICAgICAgICAgICAgICAgICAgYnVmZmVyW2J1ZmZlck9mZnNldCsrXSA9IGZyYW1lW2ZyYW1lT2Zmc2V0KytdXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgZnJhbWVPZmZzZXQgaXMgZnJhbWUubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIGZyYW1lID0gQHF1ZXVlLnJlYWQoKVxuICAgICAgICAgICAgICAgICAgICBmcmFtZU9mZnNldCA9IDBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBydW4gYW55IGFwcGxpZWQgZmlsdGVyc1xuICAgICAgICAgICAgZm9yIGZpbHRlciBpbiBAZmlsdGVyc1xuICAgICAgICAgICAgICAgIGZpbHRlci5wcm9jZXNzKGJ1ZmZlcilcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICMgaWYgd2UndmUgcnVuIG91dCBvZiBkYXRhLCBwYXVzZSB0aGUgcGxheWVyXG4gICAgICAgICAgICB1bmxlc3MgZnJhbWVcbiAgICAgICAgICAgICAgICAjIGlmIHRoaXMgd2FzIHRoZSBlbmQgb2YgdGhlIHRyYWNrLCBtYWtlXG4gICAgICAgICAgICAgICAgIyBzdXJlIHRoZSBjdXJyZW50VGltZSByZWZsZWN0cyB0aGF0XG4gICAgICAgICAgICAgICAgaWYgQHF1ZXVlLmVuZGVkXG4gICAgICAgICAgICAgICAgICAgIEBjdXJyZW50VGltZSA9IEBkdXJhdGlvblxuICAgICAgICAgICAgICAgICAgICBAZW1pdCAncHJvZ3Jlc3MnLCBAY3VycmVudFRpbWVcbiAgICAgICAgICAgICAgICAgICAgQGVtaXQgJ2VuZCdcbiAgICAgICAgICAgICAgICAgICAgQHN0b3AoKVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgIyBpZiB3ZSByYW4gb3V0IG9mIGRhdGEgaW4gdGhlIG1pZGRsZSBvZiBcbiAgICAgICAgICAgICAgICAgICAgIyB0aGUgdHJhY2ssIHN0b3AgdGhlIHRpbWVyIGJ1dCBkb24ndCBjaGFuZ2VcbiAgICAgICAgICAgICAgICAgICAgIyB0aGUgcGxheWJhY2sgc3RhdGVcbiAgICAgICAgICAgICAgICAgICAgQGRldmljZS5zdG9wKClcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgXG4gICAgICAgIEBkZXZpY2Uub24gJ3JlZmlsbCcsIEByZWZpbGxcbiAgICAgICAgQGRldmljZS5zdGFydCgpIGlmIEBwbGF5aW5nXG4gICAgICAgIEBlbWl0ICdyZWFkeSdcbiAgICAgICAgXG4gICAgZGVzdHJveTogLT5cbiAgICAgICAgQHN0b3AoKVxuICAgICAgICBAZGV2aWNlPy5vZmYoKVxuICAgICAgICBAYXNzZXQ/LmRlc3Ryb3koKVxuICAgICAgICBAb2ZmKClcbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXllclxuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi9jb3JlL2V2ZW50cydcblxuY2xhc3MgUXVldWUgZXh0ZW5kcyBFdmVudEVtaXR0ZXJcbiAgICBjb25zdHJ1Y3RvcjogKEBhc3NldCkgLT5cbiAgICAgICAgQHJlYWR5TWFyayA9IDY0XG4gICAgICAgIEBmaW5pc2hlZCA9IGZhbHNlXG4gICAgICAgIEBidWZmZXJpbmcgPSB0cnVlXG4gICAgICAgIEBlbmRlZCA9IGZhbHNlXG4gICAgICAgIFxuICAgICAgICBAYnVmZmVycyA9IFtdXG4gICAgICAgIEBhc3NldC5vbiAnZGF0YScsIEB3cml0ZVxuICAgICAgICBAYXNzZXQub24gJ2VuZCcsID0+XG4gICAgICAgICAgICBAZW5kZWQgPSB0cnVlXG4gICAgICAgICAgICBcbiAgICAgICAgQGFzc2V0LmRlY29kZVBhY2tldCgpXG4gICAgICAgIFxuICAgIHdyaXRlOiAoYnVmZmVyKSA9PlxuICAgICAgICBAYnVmZmVycy5wdXNoIGJ1ZmZlciBpZiBidWZmZXJcbiAgICAgICAgXG4gICAgICAgIGlmIEBidWZmZXJpbmdcbiAgICAgICAgICAgIGlmIEBidWZmZXJzLmxlbmd0aCA+PSBAcmVhZHlNYXJrIG9yIEBlbmRlZFxuICAgICAgICAgICAgICAgIEBidWZmZXJpbmcgPSBmYWxzZVxuICAgICAgICAgICAgICAgIEBlbWl0ICdyZWFkeSdcbiAgICAgICAgICAgIGVsc2UgICAgXG4gICAgICAgICAgICAgICAgQGFzc2V0LmRlY29kZVBhY2tldCgpXG4gICAgICAgICAgICBcbiAgICByZWFkOiAtPlxuICAgICAgICByZXR1cm4gbnVsbCBpZiBAYnVmZmVycy5sZW5ndGggaXMgMFxuICAgICAgICBcbiAgICAgICAgQGFzc2V0LmRlY29kZVBhY2tldCgpXG4gICAgICAgIHJldHVybiBAYnVmZmVycy5zaGlmdCgpXG4gICAgICAgIFxuICAgIHJlc2V0OiAtPlxuICAgICAgICBAYnVmZmVycy5sZW5ndGggPSAwXG4gICAgICAgIEBidWZmZXJpbmcgPSB0cnVlXG4gICAgICAgIEBhc3NldC5kZWNvZGVQYWNrZXQoKVxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gUXVldWVcbiIsIkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4uLy4uL2NvcmUvZXZlbnRzJ1xuQVZCdWZmZXIgPSByZXF1aXJlICcuLi8uLi9jb3JlL2J1ZmZlcidcblxuY2xhc3MgRmlsZVNvdXJjZSBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIGNvbnN0cnVjdG9yOiAoQGZpbGUpIC0+XG4gICAgICAgIGlmIG5vdCBGaWxlUmVhZGVyP1xuICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsICdUaGlzIGJyb3dzZXIgZG9lcyBub3QgaGF2ZSBGaWxlUmVhZGVyIHN1cHBvcnQuJ1xuICAgICAgICBcbiAgICAgICAgQG9mZnNldCA9IDBcbiAgICAgICAgQGxlbmd0aCA9IEBmaWxlLnNpemVcbiAgICAgICAgQGNodW5rU2l6ZSA9IDEgPDwgMjBcbiAgICAgICAgQGZpbGVbQHNsaWNlID0gJ3NsaWNlJ10gb3IgQGZpbGVbQHNsaWNlID0gJ3dlYmtpdFNsaWNlJ10gb3IgQGZpbGVbQHNsaWNlID0gJ21velNsaWNlJ11cbiAgICAgICAgICAgIFxuICAgIHN0YXJ0OiAtPlxuICAgICAgICBpZiBAcmVhZGVyXG4gICAgICAgICAgICByZXR1cm4gQGxvb3AoKSB1bmxlc3MgQGFjdGl2ZVxuICAgICAgICBcbiAgICAgICAgQHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyXG4gICAgICAgIEBhY3RpdmUgPSB0cnVlXG4gICAgICAgIFxuICAgICAgICBAcmVhZGVyLm9ubG9hZCA9IChlKSA9PlxuICAgICAgICAgICAgYnVmID0gbmV3IEFWQnVmZmVyKG5ldyBVaW50OEFycmF5KGUudGFyZ2V0LnJlc3VsdCkpXG4gICAgICAgICAgICBAb2Zmc2V0ICs9IGJ1Zi5sZW5ndGhcbiAgICAgICAgXG4gICAgICAgICAgICBAZW1pdCAnZGF0YScsIGJ1ZiAgIFxuICAgICAgICAgICAgQGFjdGl2ZSA9IGZhbHNlICAgICBcbiAgICAgICAgICAgIEBsb29wKCkgaWYgQG9mZnNldCA8IEBsZW5ndGhcbiAgICAgICAgXG4gICAgICAgIEByZWFkZXIub25sb2FkZW5kID0gPT5cbiAgICAgICAgICAgIGlmIEBvZmZzZXQgaXMgQGxlbmd0aFxuICAgICAgICAgICAgICAgIEBlbWl0ICdlbmQnXG4gICAgICAgICAgICAgICAgQHJlYWRlciA9IG51bGxcbiAgICAgICAgXG4gICAgICAgIEByZWFkZXIub25lcnJvciA9IChlKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgZVxuICAgICAgICBcbiAgICAgICAgQHJlYWRlci5vbnByb2dyZXNzID0gKGUpID0+XG4gICAgICAgICAgICBAZW1pdCAncHJvZ3Jlc3MnLCAoQG9mZnNldCArIGUubG9hZGVkKSAvIEBsZW5ndGggKiAxMDBcbiAgICAgICAgXG4gICAgICAgIEBsb29wKClcbiAgICAgICAgXG4gICAgbG9vcDogLT5cbiAgICAgICAgQGFjdGl2ZSA9IHRydWVcbiAgICAgICAgZW5kUG9zID0gTWF0aC5taW4oQG9mZnNldCArIEBjaHVua1NpemUsIEBsZW5ndGgpXG4gICAgICAgIFxuICAgICAgICBibG9iID0gQGZpbGVbQHNsaWNlXShAb2Zmc2V0LCBlbmRQb3MpXG4gICAgICAgIEByZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoYmxvYilcbiAgICAgICAgXG4gICAgcGF1c2U6IC0+XG4gICAgICAgIEBhY3RpdmUgPSBmYWxzZVxuICAgICAgICB0cnlcbiAgICAgICAgICBAcmVhZGVyPy5hYm9ydCgpXG4gICAgICAgIFxuICAgIHJlc2V0OiAtPlxuICAgICAgICBAcGF1c2UoKVxuICAgICAgICBAb2Zmc2V0ID0gMFxuXG5tb2R1bGUuZXhwb3J0cyA9IEZpbGVTb3VyY2VcbiIsIkV2ZW50RW1pdHRlciA9IHJlcXVpcmUgJy4uLy4uL2NvcmUvZXZlbnRzJ1xuQVZCdWZmZXIgPSByZXF1aXJlICcuLi8uLi9jb3JlL2J1ZmZlcidcblxuY2xhc3MgSFRUUFNvdXJjZSBleHRlbmRzIEV2ZW50RW1pdHRlclxuICAgIGNvbnN0cnVjdG9yOiAoQHVybCwgQG9wdHMgPSB7fSkgLT5cbiAgICAgICAgQGNodW5rU2l6ZSA9IDEgPDwgMjBcbiAgICAgICAgQGluZmxpZ2h0ID0gZmFsc2VcbiAgICAgICAgaWYgQG9wdHMubGVuZ3RoXG4gICAgICAgICAgICBAbGVuZ3RoID0gQG9wdHMubGVuZ3RoXG4gICAgICAgIEByZXNldCgpXG4gICAgICAgIFxuICAgIHN0YXJ0OiAtPlxuICAgICAgICBpZiBAbGVuZ3RoXG4gICAgICAgICAgICByZXR1cm4gQGxvb3AoKSB1bmxlc3MgQGluZmxpZ2h0XG4gICAgICAgIFxuICAgICAgICBAaW5mbGlnaHQgPSB0cnVlXG4gICAgICAgIEB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKVxuICAgICAgICBcbiAgICAgICAgQHhoci5vbmxvYWQgPSAoZXZlbnQpID0+XG4gICAgICAgICAgICBAbGVuZ3RoID0gcGFyc2VJbnQgQHhoci5nZXRSZXNwb25zZUhlYWRlcihcIkNvbnRlbnQtTGVuZ3RoXCIpICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgQGluZmxpZ2h0ID0gZmFsc2VcbiAgICAgICAgICAgIEBsb29wKClcbiAgICAgICAgXG4gICAgICAgIEB4aHIub25lcnJvciA9IChlcnIpID0+XG4gICAgICAgICAgICBAcGF1c2UoKVxuICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgZXJyXG4gICAgICAgICAgICBcbiAgICAgICAgQHhoci5vbmFib3J0ID0gKGV2ZW50KSA9PlxuICAgICAgICAgICAgQGluZmxpZ2h0ID0gZmFsc2VcbiAgICAgICAgXG4gICAgICAgIEB4aHIub3BlbihcIkhFQURcIiwgQHVybCwgdHJ1ZSlcbiAgICAgICAgQHhoci5zZW5kKG51bGwpXG4gICAgICAgIFxuICAgIGxvb3A6IC0+XG4gICAgICAgIGlmIEBpbmZsaWdodCBvciBub3QgQGxlbmd0aFxuICAgICAgICAgICAgcmV0dXJuIEBlbWl0ICdlcnJvcicsICdTb21ldGhpbmcgaXMgd3JvbmcgaW4gSFRUUFNvdXJjZS5sb29wJ1xuICAgICAgICAgICAgXG4gICAgICAgIEBpbmZsaWdodCA9IHRydWVcbiAgICAgICAgQHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG4gICAgICAgIFxuICAgICAgICBAeGhyLm9ubG9hZCA9IChldmVudCkgPT5cbiAgICAgICAgICAgIGlmIEB4aHIucmVzcG9uc2VcbiAgICAgICAgICAgICAgICBidWYgPSBuZXcgVWludDhBcnJheShAeGhyLnJlc3BvbnNlKVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHR4dCA9IEB4aHIucmVzcG9uc2VUZXh0XG4gICAgICAgICAgICAgICAgYnVmID0gbmV3IFVpbnQ4QXJyYXkodHh0Lmxlbmd0aClcbiAgICAgICAgICAgICAgICBmb3IgaSBpbiBbMC4uLnR4dC5sZW5ndGhdXG4gICAgICAgICAgICAgICAgICAgIGJ1ZltpXSA9IHR4dC5jaGFyQ29kZUF0KGkpICYgMHhmZlxuXG4gICAgICAgICAgICBidWZmZXIgPSBuZXcgQVZCdWZmZXIoYnVmKVxuICAgICAgICAgICAgQG9mZnNldCArPSBidWZmZXIubGVuZ3RoXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIEBlbWl0ICdkYXRhJywgYnVmZmVyXG4gICAgICAgICAgICBAZW1pdCAnZW5kJyBpZiBAb2Zmc2V0ID49IEBsZW5ndGhcblxuICAgICAgICAgICAgQGluZmxpZ2h0ID0gZmFsc2VcbiAgICAgICAgICAgIEBsb29wKCkgdW5sZXNzIEBvZmZzZXQgPj0gQGxlbmd0aFxuICAgICAgICAgICAgXG4gICAgICAgIEB4aHIub25wcm9ncmVzcyA9IChldmVudCkgPT5cbiAgICAgICAgICAgIEBlbWl0ICdwcm9ncmVzcycsIChAb2Zmc2V0ICsgZXZlbnQubG9hZGVkKSAvIEBsZW5ndGggKiAxMDBcblxuICAgICAgICBAeGhyLm9uZXJyb3IgPSAoZXJyKSA9PlxuICAgICAgICAgICAgQGVtaXQgJ2Vycm9yJywgZXJyXG4gICAgICAgICAgICBAcGF1c2UoKVxuXG4gICAgICAgIEB4aHIub25hYm9ydCA9IChldmVudCkgPT5cbiAgICAgICAgICAgIEBpbmZsaWdodCA9IGZhbHNlXG5cbiAgICAgICAgQHhoci5vcGVuKFwiR0VUXCIsIEB1cmwsIHRydWUpXG4gICAgICAgIEB4aHIucmVzcG9uc2VUeXBlID0gXCJhcnJheWJ1ZmZlclwiXG5cbiAgICAgICAgZW5kUG9zID0gTWF0aC5taW4oQG9mZnNldCArIEBjaHVua1NpemUsIEBsZW5ndGggLSAxKVxuICAgICAgICBAeGhyLnNldFJlcXVlc3RIZWFkZXIoXCJJZi1Ob25lLU1hdGNoXCIsIFwid2Via2l0LW5vLWNhY2hlXCIpXG4gICAgICAgIEB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlJhbmdlXCIsIFwiYnl0ZXM9I3tAb2Zmc2V0fS0je2VuZFBvc31cIilcbiAgICAgICAgQHhoci5vdmVycmlkZU1pbWVUeXBlKCd0ZXh0L3BsYWluOyBjaGFyc2V0PXgtdXNlci1kZWZpbmVkJylcbiAgICAgICAgQHhoci5zZW5kKG51bGwpXG4gICAgICAgIFxuICAgIHBhdXNlOiAtPlxuICAgICAgICBAaW5mbGlnaHQgPSBmYWxzZVxuICAgICAgICBAeGhyPy5hYm9ydCgpXG4gICAgICAgIFxuICAgIHJlc2V0OiAtPlxuICAgICAgICBAcGF1c2UoKVxuICAgICAgICBAb2Zmc2V0ID0gMFxuICAgICAgICBcbm1vZHVsZS5leHBvcnRzID0gSFRUUFNvdXJjZVxuIiwiRXZlbnRFbWl0dGVyID0gcmVxdWlyZSAnLi4vY29yZS9ldmVudHMnXG5CdWZmZXJMaXN0ID0gcmVxdWlyZSAnLi4vY29yZS9idWZmZXJsaXN0J1xuQVZCdWZmZXIgPSByZXF1aXJlICcuLi9jb3JlL2J1ZmZlcidcblxuY2xhc3MgQnVmZmVyU291cmNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyICAgIFxuICAgIGNvbnN0cnVjdG9yOiAoaW5wdXQpIC0+XG4gICAgICAgICMgTm93IG1ha2UgYW4gQVYuQnVmZmVyTGlzdFxuICAgICAgICBpZiBpbnB1dCBpbnN0YW5jZW9mIEJ1ZmZlckxpc3RcbiAgICAgICAgICAgIEBsaXN0ID0gaW5wdXRcbiAgICAgICAgICAgIFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAbGlzdCA9IG5ldyBCdWZmZXJMaXN0XG4gICAgICAgICAgICBAbGlzdC5hcHBlbmQgbmV3IEFWQnVmZmVyKGlucHV0KVxuICAgICAgICAgICAgXG4gICAgICAgIEBwYXVzZWQgPSB0cnVlXG4gICAgICAgIFxuICAgIHNldEltbWVkaWF0ZSA9IGdsb2JhbC5zZXRJbW1lZGlhdGUgb3IgKGZuKSAtPlxuICAgICAgICBnbG9iYWwuc2V0VGltZW91dCBmbiwgMFxuICAgICAgICBcbiAgICBjbGVhckltbWVkaWF0ZSA9IGdsb2JhbC5jbGVhckltbWVkaWF0ZSBvciAodGltZXIpIC0+XG4gICAgICAgIGdsb2JhbC5jbGVhclRpbWVvdXQgdGltZXJcbiAgICAgICAgXG4gICAgc3RhcnQ6IC0+XG4gICAgICAgIEBwYXVzZWQgPSBmYWxzZVxuICAgICAgICBAX3RpbWVyID0gc2V0SW1tZWRpYXRlIEBsb29wXG4gICAgICAgIFxuICAgIGxvb3A6ID0+XG4gICAgICAgIEBlbWl0ICdwcm9ncmVzcycsIChAbGlzdC5udW1CdWZmZXJzIC0gQGxpc3QuYXZhaWxhYmxlQnVmZmVycyArIDEpIC8gQGxpc3QubnVtQnVmZmVycyAqIDEwMCB8IDBcbiAgICAgICAgQGVtaXQgJ2RhdGEnLCBAbGlzdC5maXJzdFxuICAgICAgICBpZiBAbGlzdC5hZHZhbmNlKClcbiAgICAgICAgICAgIHNldEltbWVkaWF0ZSBAbG9vcFxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBAZW1pdCAnZW5kJ1xuICAgICAgICBcbiAgICBwYXVzZTogLT5cbiAgICAgICAgY2xlYXJJbW1lZGlhdGUgQF90aW1lclxuICAgICAgICBAcGF1c2VkID0gdHJ1ZVxuICAgICAgICBcbiAgICByZXNldDogLT5cbiAgICAgICAgQHBhdXNlKClcbiAgICAgICAgQGxpc3QucmV3aW5kKClcbiAgICAgICAgXG5tb2R1bGUuZXhwb3J0cyA9IEJ1ZmZlclNvdXJjZVxuIl19
