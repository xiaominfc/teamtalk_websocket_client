/**
 * @file im.js
 * @author xiaominfc
 * @description connect to teamtalk webscoket server for chat
 */

'use strict';

function HashMap(){  
	this.Set = function(key,value){this[key] = value};  
	this.Get = function(key){return this[key]};  
	this.Contains = function(key){return this.Get(key) == null?false:true};  
	this.Remove = function(key){delete this[key]};  
}
/**
 * store cache data for chat
 * @type {Object}
 */
var imDb = {
	initDb:function(uid) { 
			   this.userDb = new HashMap;
			   this.msgDb = new HashMap;
			   this.groupDb = new HashMap;
			   this.uid;
		   },
	getUserbyId: function(key) {
					 return this.userDb.Get(key);
				 },
	addUsertoDb: function(key,user) {
					 user.uid = key;
					 this.userDb.Set(key,user);
				 },
	getAllUserFromDb: function() {
						  var list = new Array();  
						  for(var i in this.userDb) {
							  var item = this.userDb.Get(i);
							  if(typeof item === 'function' || item.uid === this.uid) {
								  continue;
							  }
							  list.push(item);
						  }
						  return list;
					  },
	getMessageBykey: function(key) {
						 return this.msgDb.Get(key);
					 },
	addMessagetoDb: function(key,msg) {
						var msgs = this.msgDb.Get(key);
						if(!Array.isArray(msgs)) {
							msgs = [];
						}
						if(!Array.isArray(msg)) {
							msgs = [].concat(msg).concat(msgs);    
						}else {
							msgs = msgs.concat(msg);    
						}
						this.msgDb.Set(key,msgs);
					},
	addGroupInfoToDb: function(groupinfo) {
						  if(Array.isArray(groupinfo)) {
							  for(var i in groupinfo) {
								  var item = groupinfo[i];
								  this.groupDb.Set(item.groupId,item);
							  }
						  }else {
							  this.groupDb.Set(groupinfo.groupId,groupinfo);
						  }
					  },
	findGroupInfoById:function(id) {
						  return this.groupDb.Get(id);
					  },
	getAllGroupList:function() {
						var list = new Array();  
						for(var i in this.groupDb) {
							var item = this.groupDb.Get(i);
							if(typeof item === 'function') {
								continue;
							}
							list.push(item);
						}
						return list;
					}
};


var IMBaseDefine,IMLogin,IMGroup,IMOther,IMBuddy,IMMessage;
protobuf.load('./pb/IM.BaseDefine.proto',function(err,root){
	IMBaseDefine = root;
})
protobuf.load('./pb/IM.Login.proto',function(err,root){
	IMLogin = root;
})
protobuf.load('./pb/IM.Group.proto',function(err,root){
	IMGroup = root;
})
protobuf.load('./pb/IM.Other.proto',function(err,root){
	IMOther = root;
})
protobuf.load('./pb/IM.Buddy.proto',function(err,root){
	IMBuddy = root;
})
protobuf.load('./pb/IM.Message.proto',function(err,root){
	IMMessage = root;
})


var apiHashMap = new HashMap;
var localMsgId = 1000000;
var actionSeqNum = 1;

//生成一个api的序列号 保证请求的顺序
function genSeqNum() {
	actionSeqNum ++;
	return actionSeqNum;
}



//给准备加密的数据补零
function padText(source,count) {
    var size = 4;
    var x = source.words.length % size;
    if(x > 0) {
    	var padLength = size - x;
    //var end = count * 3;
    	for (var i = 0; i < padLength - 1; i++) {
    		source.words.push(0);
    	}
    	source.words.push(count);		
    }else {
		source.words.push(0);
		source.words.push(0);
		source.words.push(0);
		source.words.push(count);
	}
    
    source.sigBytes = 4 * source.words.length;
    return source;
}


/**
 * @description get length for chinse and english
 * @param  {string} 
 * @return {int}
 */
function getStringLength(str) {
    ///<summary>获得字符串实际长度，中文3，英文1</summary> utf8
    ///<param name="str">要获得长度的字符串</param>
    var realLength = 0, len = str.length, charCode = -1;
    for (var i = 0; i < len; i++) {

        charCode = str.charCodeAt(i);
        if (charCode >= 0 && charCode <= 128) realLength += 1;
        else realLength += 3;
        //console.log(i  + '   :' + realLength);
    }
    return realLength;
}


/**
 * @param  {string}
 * @return {string}
 * @description aes encrypt
 */
function aesEncryptText(text)
{
	var result = '';
	try {
	    var data = padText(CryptoJS.enc.Utf8.parse(text),getStringLength(text));
	    //console.log(data);
		var key = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		var iv  = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		var encrypted = CryptoJS.AES.encrypt(data, key, {iv:iv , mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding});
		result = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
	}catch(err)
	{
		console.log(err);
	}
	return result;
}

/**
 * @param  {string}
 * @return {string}
 * @description aes decrypt
 */
function aesDecryptText(data)
{
	if(typeof data != 'string') {
		var base64String = window.btoa(String.fromCharCode.apply(null, data));
		data = Base64.decode(base64String);
	}
	var text = '';
	try {
		var key = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		var iv  = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		text = CryptoJS.AES.decrypt(data, key, {iv:iv, mode: CryptoJS.mode.ECB,  padding: CryptoJS.pad.NoPadding});
		//console.log(text);
		if(text.words[text.words.length - 2] == 0) {
			text.words[text.words.length - 1] = 0;
 		}else if(text.sigBytes > text.words[text.words.length - 1]){
 			text.words[text.words.length - 1] = 0;
 			//text.sigBytes = text.words[text.words.length - 1];	
 		}
		text = CryptoJS.enc.Utf8.stringify(text);
	}catch(err)
	{
		text = '';
	}
	return text;
}

/**
 * @param  {WebSocket}
 * @param  {TeamTalkWebClient}
 * @description listen some thing for websocket and bind to client
 */
function bindWebsocketForClinet(wsSocket, client) {
	wsSocket.binaryType = "arraybuffer";
	wsSocket.onopen = function(event) {
		client.clientState =  UserStatType.USER_STATUS_ONLINE;
		if(client.logined && !!client.loginInfo) {
			client.relogin(function(res,error){
				if(res){
					console.log('relogin success');
				}
			});
		}
	}

	wsSocket.onmessage = function(event) {
		var pdu = event.data.slice(0,16);
		var dv = new DataView(pdu,0);
		var data = {};
		data.commandId = dv.getUint16(10);
		data.seqNum = dv.getUint16(12);
		data.serviceId = dv.getUint16(8);
		data.content = event.data.slice(16);
		client.handleEventData(data);
	}

	wsSocket.onclose = function(event) {
		console.log("websocket onclose");
		if(!window.navigator.onLine)
		{
			client.clientState = UserStatType.USER_STATUS_OFFLINE;
			client.connect();
		}else if(client.logined) {
			client.connect();
		}
	}
}

function buildPackage(req,serviceId,commandId,seqNum)
{


	var length = req.byteLength + 16;		
	var buffer = new ArrayBuffer(length);
	var dv = new DataView(buffer, 0);
	dv.setUint32(0,length);
	dv.setUint16(4,0);
	dv.setUint16(6,0);
	dv.setUint16(8,serviceId);
	dv.setUint16(10,commandId);
	dv.setUint16(12,seqNum);
	dv.setUint16(14,0);

	 var tmp = new Uint8Array(buffer);
	 tmp.set(new Uint8Array(req),16);
	return buffer;
}



var TeamTalkWebClient = function(config) {
	this.websocketUrl = config.wsurl;
	this.clientState = UserStatType.USER_STATUS_OFFLINE;
	this.logined = false;
	this.connect();
};

/**
 * @description connet to server
 */
TeamTalkWebClient.prototype.connect = function() {
	if(!!this.websocket) {
		this.websocket.close();
	}
	this.websocket = new WebSocket(this.websocketUrl);
	bindWebsocketForClinet(this.websocket,this);
};

/**
 * @return state for ready
 * @description check wesocket is opened and pb is loaded
 */
TeamTalkWebClient.prototype.wsIsReady = function(){
	if(this.websocket) {
		return this.websocket.readyState == 1 && IMBaseDefine && IMLogin && IMMessage && IMGroup && IMBuddy && IMOther;
	}
	return false;
};


/**
 * @param  {ArrayBuffer}
 * @return {nil}
 * @description send data by websocket
 */
TeamTalkWebClient.prototype.sendBinaryData = function(binaryData){
	this.websocket.send(binaryData);	
};

/**
 * @param  {object} info.username info.password	
 * @param  {Function} callback
 * @return {NULL}
 * @description do action for login im
 */
TeamTalkWebClient.prototype.loginAction = function(info,callback) {
	//var LoginReq = IMLogin.build('IM.Login.IMLoginReq');
	var LoginReq = IMLogin.lookupType('IM.Login.IMLoginReq');
	info.client_version = '1.0';
	info.client_type = 1;
	info.online_status = UserStatType.USER_STATUS_ONLINE;
	this.loginInfo = info;
	var data ={userName:'' + info.username,password:info.password,onlineStatus:UserStatType.USER_STATUS_ONLINE,clientType:1,clientVersion:'1.0'}
	// var errMsg = LoginReq.verify(data);
 //    if (errMsg)
 //        throw Error(errMsg);
    var message = LoginReq.create(data); // or use .fromObject if conversion is necessary
    var msgBuffer = LoginReq.encode(message).finish();
    var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
    var buffer = buildPackage(msgBuffer,ServiceID.SID_LOGIN,LoginCmdID.CID_LOGIN_REQ_USERLOGIN,sn);
	this.sendBinaryData(buffer);
};


TeamTalkWebClient.prototype.handleResForLogin = function(data) {
    //var IMLoginRes = IMLogin.build('IM.Login.IMLoginRes');

    var IMLoginRes = IMLogin.lookupType('IM.Login.IMLoginRes');
	var msg = IMLoginRes.decode(new Uint8Array(data.content));
	if(msg) {
		var loginApi = apiHashMap.Get(data.seqNum);
		if(msg.resultCode == ResultType.REFUSE_REASON_NONE) {
			this.logined = true;
			this.uid = msg.userInfo.userId;
			this.user = msg.userInfo;
			loginApi.callback(true,msg.userInfo);

			if(this.heartBeatTimer) {
				clearInterval(this.heartBeatTimer)
			}
			var _this = this;
			_this.sendHeartBeat();
			this.heartBeatTimer = setInterval(function() {
				console.log("send heartBeat");
  				_this.sendHeartBeat();
			}, 45 * 1000);//45秒发送一次心跳包
		}else {
			loginApi.callback(false,msg.resultString);
		}
	}
};

TeamTalkWebClient.prototype.relogin = function(callback) {
	if(!!this.loginInfo) {
		this.loginAction(this.loginInfo,callback);
	}
};


//发消息的api 
TeamTalkWebClient.prototype.sendMsgApiAction = function(msg,callback) {
	var IMMsgData = IMMessage.lookupType('IM.Message.IMMsgData');
	var msgContent = aesEncryptText(msg.msgData);
	msg.msgData = Base64.encode(msgContent);
	//var data = {fromUserId:msg.fromUserId,toSessionId:msg.toSession_id,msgData:Base64.encode(msgContent),msgType:msg.msg_type,msgId:msg.msgId,createTime:msg.created};
	var message =  IMMsgData.create(msg);
	var msgBuffer = IMMsgData.encode(message).finish(); 
	var api = {msg:msg , callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,api);
    var buffer = buildPackage(msgBuffer,ServiceID.SID_MSG,MessageCmdID.CID_MSG_DATA,sn);
	this.sendBinaryData(buffer);
};


//消息发送到服务器成功(服务器反馈)
TeamTalkWebClient.prototype.handleResForMsgAck = function(data) {
	var IMMsgDataAck = IMMessage.lookupType('IM.Message.IMMsgDataAck');
	var msg = IMMsgDataAck.decode(new Uint8Array(data.content));
	var sendMsgApi = apiHashMap.Get(data.seqNum);
	if(!!sendMsgApi) {
		sendMsgApi.msg.msgId =  msg.msgId;
		sendMsgApi.callback(true,sendMsgApi.msg);
		apiHashMap.Remove(data.seqNum);
	}
};


//获取群列表
TeamTalkWebClient.prototype.getGroupListApiAction = function(callback) {
	var IMNormalGroupListReq = IMGroup.lookupType('IM.Group.IMNormalGroupListReq');
	var data = {userId:this.uid};
	var msgBuffer = IMNormalGroupListReq.encode(IMNormalGroupListReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_GROUP,GroupCmdID.CID_GROUP_NORMAL_LIST_REQUEST,sn);
	this.sendBinaryData(buffer);
};

//处理服务端返回的群列表
TeamTalkWebClient.prototype.handleGroupNormalList = function(data) {
	var IMNormalGroupListRsp = IMGroup.lookupType('IM.Group.IMNormalGroupListRsp');
	var msg = IMNormalGroupListRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp);
};


//获取群详情
TeamTalkWebClient.prototype.getGroupInfoApiAction = function(content,callback) {
	var IMGroupInfoListReq = IMGroup.lookupType('IM.Group.IMGroupInfoListReq');
	var data = {userId:this.uid, groupVersionList:content.groupVersionList};
	var msgBuffer = IMGroupInfoListReq.encode(IMGroupInfoListReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_GROUP,GroupCmdID.CID_GROUP_INFO_REQUEST,sn);
	this.sendBinaryData(buffer);
};

//处理服务端返回的群详情
TeamTalkWebClient.prototype.handleGroupInfoRes = function(data) {
	var IMGroupInfoListRsp = IMGroup.lookupType('IM.Group.IMGroupInfoListRsp');
	var msg = IMGroupInfoListRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp);   
};

//获信息列表
TeamTalkWebClient.prototype.getMsgListApiAction = function(content,callback) {
	console.log('getMsgListApiAction');
	var IMGetMsgListReq = IMMessage.lookupType('IM.Message.IMGetMsgListReq');
	var data = {userId:this.uid, sessionType:content.sessionType, sessionId:content.sessionId,msgIdBegin:content.msgIdBegin,msgCnt:content.msgCnt};
	console.log(data);
	var msgBuffer = IMGetMsgListReq.encode(IMGetMsgListReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_MSG,MessageCmdID.CID_MSG_LIST_REQUEST,sn);
	this.sendBinaryData(buffer);
};

//处理服务端应答回来的消息列表
TeamTalkWebClient.prototype.handleResForMsgList = function(data) {
	var IMGetMsgListRsp = IMMessage.lookupType('IM.Message.IMGetMsgListRsp');
	var msg = IMGetMsgListRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp);   
};

//获取最近会话列表
TeamTalkWebClient.prototype.getRecentlySession = function(content,callback){
	var IMRecentContactSessionReq = IMBuddy.lookupType('IM.Buddy.IMRecentContactSessionReq');
	var data = {userId:this.uid, latestUpdateTime:content.latestUpdateTime};
	var msgBuffer = IMRecentContactSessionReq.encode(IMRecentContactSessionReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_BUDDY_LIST ,BuddyListCmdID.CID_BUDDY_LIST_RECENT_CONTACT_SESSION_REQUEST,sn);
	this.sendBinaryData(buffer);
};


TeamTalkWebClient.prototype.handleResForRecentlySession = function(data)
{
	var IMRecentContactSessionRsp = IMBuddy.lookupType('IM.Buddy.IMRecentContactSessionRsp');
	var msg = IMRecentContactSessionRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp);  
};



//获取所有好友列表(单聊的时候会用上)
TeamTalkWebClient.prototype.getAllFriends = function(content,callback){
	//content.user_id = imConnection.uid;
	var IMAllUserReq = IMBuddy.lookupType('IM.Buddy.IMAllUserReq');
	var data = {userId:this.uid, latestUpdateTime:0}
	var msgBuffer = IMAllUserReq.encode(IMAllUserReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_BUDDY_LIST ,BuddyListCmdID.CID_BUDDY_LIST_ALL_USER_REQUEST,sn);
	this.sendBinaryData(buffer);
};


TeamTalkWebClient.prototype.handleResForAllFriends = function(data) {
	var IMAllUserRsp = IMBuddy.lookupType('IM.Buddy.IMAllUserRsp');
	var msg = IMAllUserRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp); 
};

//获取好友信息
TeamTalkWebClient.prototype.getFriendsByIds = function(ids,callback) {
	if(!ids || ids.length == 0) {
		return;
	}
	var IMUsersInfoReq = IMBuddy.lookupType('IM.Buddy.IMUsersInfoReq');
	var data = {userId:this.uid, userIdList:ids}
	var msgBuffer = IMUsersInfoReq.encode(IMUsersInfoReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_BUDDY_LIST ,BuddyListCmdID.CID_BUDDY_LIST_USER_INFO_REQUEST,sn);
	this.sendBinaryData(buffer);
};


TeamTalkWebClient.prototype.handleResForFriendsByIds = function(data){
	var IMUsersInfoRsp = IMBuddy.lookupType('IM.Buddy.IMUsersInfoRsp');
	var msg = IMUsersInfoRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp); 
};

//获取未读消息
TeamTalkWebClient.prototype.getUnreadMessageCnt = function(content,callback){
	var IMUnreadMsgCntReq = IMMessage.lookupType('IM.Message.IMUnreadMsgCntReq');
	var data = {userId:this.uid};
	var msgBuffer = IMUnreadMsgCntReq.encode(IMUnreadMsgCntReq.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer ,ServiceID.SID_MSG ,MessageCmdID.CID_MSG_UNREAD_CNT_REQUEST,sn);
	this.sendBinaryData(buffer);
};

TeamTalkWebClient.prototype.handleUnReadMessageCnt = function(data) {
	var IMUnreadMsgCntRsp = IMMessage.lookupType('IM.Message.IMUnreadMsgCntRsp');
	var msg = IMUnreadMsgCntRsp.decode(new Uint8Array(data.content));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	this.simpleWorkForHandle(rsp);
};


//应答给服务端 读了这条消息
TeamTalkWebClient.prototype.answerMsg = function(content,callback){
	var IMMsgDataReadAck = IMMessage.lookupType('IM.Message.IMMsgDataReadAck');
	var data = {userId:this.uid, sessionId:content.sessionId,msgId:content.msgId,sessionType:content.sessionType};
	var msgBuffer = IMMsgDataReadAck.encode(IMMsgDataReadAck.create(data)).finish();
	var sendMsgApi = {callback:callback};
	var sn = genSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgBuffer,ServiceID.SID_MSG ,MessageCmdID.CID_MSG_READ_ACK,sn);
	this.sendBinaryData(buffer);
};

//应答来自服务端的心跳包
TeamTalkWebClient.prototype.sendHeartBeat = function()
{
	
	var IMHeartBeat = IMOther.lookupType('IM.Other.IMHeartBeat');
	var msgBuffer = IMHeartBeat.encode(IMHeartBeat.create({})).finish();
	var sn = genSeqNum();
	var buffer = buildPackage(msgBuffer,ServiceID.SID_OTHER,OtherCmdID.CID_OTHER_HEARTBEAT,sn);
	this.sendBinaryData(buffer);
	
};


//应答来自服务端的心跳包
TeamTalkWebClient.prototype.answerHeartBeat = function()
{
	console.log("get answer heartBeat");
	// var IMHeartBeat = IMOther.lookupType('IM.Other.IMHeartBeat');
	// var msgBuffer = IMHeartBeat.encode(IMHeartBeat.create({})).finish();
	// var buffer = buildPackage(msgBuffer,ServiceID.SID_OTHER,OtherCmdID.CID_OTHER_HEARTBEAT,sn);
	// this.sendBinaryData(buffer);
};



TeamTalkWebClient.prototype.handleEventData = function(data) {
	switch(data.commandId) {
		case LoginCmdID.CID_LOGIN_RES_USERLOGIN:      //登录请求后,服务的应答
			this.handleResForLogin(data);
			break;
		case MessageCmdID.CID_MSG_DATA:               //服务端向客户端发的消息
			this.handleResForNewMsg(data);
			break;
		case MessageCmdID.CID_MSG_DATA_ACK:           //客户端发消息成功后,服务端的应答
			this.handleResForMsgAck(data);
			break;
		case MessageCmdID.CID_MSG_LIST_RESPONSE:      //客户端请求消息列表得到的应答
			this.handleResForMsgList(data);
			break;
		case MessageCmdID.CID_MSG_UNREAD_CNT_RESPONSE://客户端请求未读消息得到的应答
			this.handleUnReadMessageCnt(data);
			break;
		case GroupCmdID.CID_GROUP_NORMAL_LIST_RESPONSE://客户端请求群列表得到应答
			this.handleGroupNormalList(data);
			break;
		case GroupCmdID.CID_GROUP_INFO_RESPONSE:       //客户端请求群详情得到的应答
			this.handleGroupInfoRes(data);
			break;
		case BuddyListCmdID.CID_BUDDY_LIST_RECENT_CONTACT_SESSION_RESPONSE://请求最近会话列表服务端的应答
			this.handleResForRecentlySession(data);
			break;
		case BuddyListCmdID.CID_BUDDY_LIST_ALL_USER_RESPONSE:
			this.handleResForAllFriends(data);
			break;
		case BuddyListCmdID.CID_BUDDY_LIST_USER_INFO_RESPONSE:
			this.handleResForFriendsByIds(data);
			break;
		case OtherCmdID.CID_OTHER_HEARTBEAT:
			this.answerHeartBeat();
			break;
		default:
			console.log("not such commandId:" + data.commandId);
			console.log("data:" + JSON.stringify(data));
			break;
	}
};



//收到一条新消息
TeamTalkWebClient.prototype.handleResForNewMsg = function(data) {
	if(data.content) {
		console.log(data);
		if(typeof this.msgHandler === "function") {
			var IMMsgData = IMMessage.lookupType('IM.Message.IMMsgData');
			var msg = IMMsgData.decode(new Uint8Array(data.content));
			this.msgHandler(msg);
		}
	}
};




//简单的处理了api的应答结果
TeamTalkWebClient.prototype.simpleWorkForHandle = function(data) {
	if(data.content) {
		console.log("finish api for seqNum:" + data.seqNum);
		var api = apiHashMap.Get(data.seqNum);
		if(!!api) {
			api.callback(true,data.content);
			apiHashMap.Remove(data.seqNum);    
		}
	}
};


//给指定群号发送一条消息
TeamTalkWebClient.prototype.sendGroupTextMsg = function(text,groupId,callback) {
	var content = {fromUserId:this.uid,toSessionId:groupId,msgData:text,msgType:MsgType.MSG_TYPE_GROUP_TEXT,msgId:localMsgId,createTime:Date.parse(new Date())/ 1000};
	localMsgId++;
	this.sendMsgApiAction(content,callback);
};

//给指定用户发送一条消息
TeamTalkWebClient.prototype.sendSingleTextMsg = function(text,toUserId,callback) {
	var content = {fromUserId:this.uid,toSessionId:toUserId,msgData:text,msgType:MsgType.MSG_TYPE_SINGLE_TEXT,msgId:localMsgId,createTime:Date.parse(new Date())/ 1000};
	localMsgId++;
	this.sendMsgApiAction(content,callback);
};

//定义的一些常量以及枚举
var DD_MESSAGE_IMAGE_PREFIX = "&$#@~^@[{:";
var DD_MESSAGE_IMAGE_SUFFIX = ":}]&$~@#@";

var UserStatType = {
	USER_STATUS_ONLINE : 1,
	USER_STATUS_OFFLINE : 2,
	USER_STATUS_LEAVE : 3
};

var ServiceID = {
	SID_LOGIN : 1,
	SID_BUDDY_LIST : 2,
	SID_MSG : 3,
	SID_GROUP : 4,
	SID_FILE : 5,
	SID_SWITCH_SERVICE : 6,
	SID_OTHER : 7,
	SID_INTERNAL : 8
};

var BuddyListCmdID = {
	CID_BUDDY_LIST_RECENT_CONTACT_SESSION_REQUEST : 513,
	CID_BUDDY_LIST_RECENT_CONTACT_SESSION_RESPONSE : 514,
	CID_BUDDY_LIST_STATUS_NOTIFY : 515,
	CID_BUDDY_LIST_USER_INFO_REQUEST : 516,
	CID_BUDDY_LIST_USER_INFO_RESPONSE : 517,
	CID_BUDDY_LIST_REMOVE_SESSION_REQ : 518,
	CID_BUDDY_LIST_REMOVE_SESSION_RES : 519,
	CID_BUDDY_LIST_ALL_USER_REQUEST : 520,
	CID_BUDDY_LIST_ALL_USER_RESPONSE : 521,
	CID_BUDDY_LIST_USERS_STATUS_REQUEST : 522,
	CID_BUDDY_LIST_USERS_STATUS_RESPONSE : 523,
	CID_BUDDY_LIST_CHANGE_AVATAR_REQUEST : 524,
	CID_BUDDY_LIST_CHANGE_AVATAR_RESPONSE : 525,
	CID_BUDDY_LIST_PC_LOGIN_STATUS_NOTIFY : 526,
	CID_BUDDY_LIST_REMOVE_SESSION_NOTIFY : 527,
	CID_BUDDY_LIST_DEPARTMENT_REQUEST : 528,
	CID_BUDDY_LIST_DEPARTMENT_RESPONSE : 529,
	CID_BUDDY_LIST_AVATAR_CHANGED_NOTIFY : 530,
	CID_BUDDY_LIST_CHANGE_SIGN_INFO_REQUEST :531,
	CID_BUDDY_LIST_CHANGE_SIGN_INFO_RESPONSE : 532,
	CID_BUDDY_LIST_SIGN_INFO_CHANGED_NOTIFY : 533
};

var LoginCmdID = {
	CID_LOGIN_REQ_MSGSERVER : 257,
	CID_LOGIN_RES_MSGSERVER : 258,
	CID_LOGIN_REQ_USERLOGIN : 259,
	CID_LOGIN_RES_USERLOGIN : 260,
	CID_LOGIN_REQ_LOGINOUT : 261,
	CID_LOGIN_RES_LOGINOUT : 262,
	CID_LOGIN_KICK_USER : 263,
	CID_LOGIN_REQ_DEVICETOKEN : 264,
	CID_LOGIN_RES_DEVICETOKEN : 265,
	CID_LOGIN_REQ_KICKPCCLIENT : 266,
	CID_LOGIN_RES_KICKPCCLIENT : 267,
	CID_LOGIN_REQ_PUSH_SHIELD : 268,
	CID_LOGIN_RES_PUSH_SHIELD : 269,
	CID_LOGIN_REQ_QUERY_PUSH_SHIELD : 270,
	CID_LOGIN_RES_QUERY_PUSH_SHIELD : 271
};


var MessageCmdID = {
	CID_MSG_DATA : 769,
	CID_MSG_DATA_ACK : 770,
	CID_MSG_READ_ACK : 771,
	CID_MSG_READ_NOTIFY : 772,
	CID_MSG_TIME_REQUEST : 773,
	CID_MSG_TIME_RESPONSE : 774,
	CID_MSG_UNREAD_CNT_REQUEST : 775,
	CID_MSG_UNREAD_CNT_RESPONSE : 776,
	CID_MSG_LIST_REQUEST : 777,
	CID_MSG_LIST_RESPONSE : 778,
	CID_MSG_GET_LATEST_MSG_ID_REQ : 779,
	CID_MSG_GET_LATEST_MSG_ID_RSP : 780,
	CID_MSG_GET_BY_MSG_ID_REQ : 781,
	CID_MSG_GET_BY_MSG_ID_RES : 782
};

var SessionType = {
	SESSION_TYPE_SINGLE : 1,
	SESSION_TYPE_GROUP : 2
};


var UserStatType = {
	USER_STATUS_ONLINE : 1,
	USER_STATUS_OFFLINE : 2,
    USER_STATUS_LEAVE : 3
};

var MsgType = {
	MSG_TYPE_SINGLE_TEXT : 1,
	MSG_TYPE_SINGLE_AUDIO : 2,
	MSG_TYPE_GROUP_TEXT : 17,
	MSG_TYPE_GROUP_AUDIO : 18
};

var ResultType = {
	REFUSE_REASON_NONE : 0,
	REFUSE_REASON_NO_MSG_SERVER : 1,
	REFUSE_REASON_MSG_SERVER_FULL : 2,
	REFUSE_REASON_NO_DB_SERVER : 3,
	REFUSE_REASON_NO_LOGIN_SERVER : 4,
	REFUSE_REASON_NO_ROUTE_SERVER : 5,
	REFUSE_REASON_DB_VALIDATE_FAILED : 6,
	REFUSE_REASON_VERSION_TOO_OLD : 7
};

var GroupCmdID = {
	CID_GROUP_NORMAL_LIST_REQUEST : 1025,
	CID_GROUP_NORMAL_LIST_RESPONSE : 1026,
	CID_GROUP_INFO_REQUEST : 1027,
	CID_GROUP_INFO_RESPONSE : 1028,
	CID_GROUP_CREATE_REQUEST : 1029,
	CID_GROUP_CREATE_RESPONSE : 1030,
	CID_GROUP_CHANGE_MEMBER_REQUEST : 1031,
	CID_GROUP_CHANGE_MEMBER_RESPONSE : 1032,
	CID_GROUP_SHIELD_GROUP_REQUEST : 1033,
	CID_GROUP_SHIELD_GROUP_RESPONSE : 1034,
	CID_GROUP_CHANGE_MEMBER_NOTIFY : 1035
};

var OtherCmdID = {
  CID_OTHER_HEARTBEAT : 1793,
  CID_OTHER_STOP_RECV_PACKET : 1794,
  CID_OTHER_VALIDATE_REQ : 1795,
  CID_OTHER_VALIDATE_RSP : 1796,
  CID_OTHER_GET_DEVICE_TOKEN_REQ : 1797,
  CID_OTHER_GET_DEVICE_TOKEN_RSP : 1798,
  CID_OTHER_ROLE_SET : 1799,
  CID_OTHER_ONLINE_USER_INFO : 1800,
  CID_OTHER_MSG_SERV_INFO : 1801,
  CID_OTHER_USER_STATUS_UPDATE : 1802,
  CID_OTHER_USER_CNT_UPDATE : 1803,
  CID_OTHER_SERVER_KICK_USER : 1805,
  CID_OTHER_LOGIN_STATUS_NOTIFY : 1806,
  CID_OTHER_PUSH_TO_USER_REQ : 1807,
  CID_OTHER_PUSH_TO_USER_RSP : 1808,
  CID_OTHER_GET_SHIELD_REQ : 1809,
  CID_OTHER_GET_SHIELD_RSP : 1810,
  CID_OTHER_FILE_TRANSFER_REQ : 1841,
  CID_OTHER_FILE_TRANSFER_RSP : 1842,
  CID_OTHER_FILE_SERVER_IP_REQ : 1843,
  CID_OTHER_FILE_SERVER_IP_RSP : 1844
};



