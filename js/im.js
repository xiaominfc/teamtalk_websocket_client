'use strict';

function HashMap(){  
	this.Set = function(key,value){this[key] = value};  
	this.Get = function(key){return this[key]};  
	this.Contains = function(key){return this.Get(key) == null?false:true};  
	this.Remove = function(key){delete this[key]};  
}

var imDb = {
	initDb:function() { 
			   this.userDb = new HashMap;
			   this.msgDb = new HashMap;
			   this.groupDb = new HashMap;
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
							  if(typeof item === 'function' || item.uid === imConnection.uid) {
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
								  this.groupDb.Set(item.group_id,item);
							  }
						  }else {
							  this.groupDb.Set(groupinfo.group_id,groupinfo);
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



//init pb
var ProtoBuf = dcodeIO.ProtoBuf;
var IMBaseDefine = ProtoBuf.loadProtoFile("./pb/IM.BaseDefine.proto"); 
var IMLogin = ProtoBuf.loadProtoFile("./pb/IM.Login.proto");
var IMGroup = ProtoBuf.loadProtoFile("./pb/IM.Group.proto");
var IMOther = ProtoBuf.loadProtoFile("./pb/IM.Other.proto");
var IMBuddy = ProtoBuf.loadProtoFile("./pb/IM.Buddy.proto");
var IMMessage = ProtoBuf.loadProtoFile("./pb/IM.Message.proto");

var apiHashMap = new HashMap;
var local_msg_id = 1000000;

var actionSeqNum = 1;

//生成一个api的序列号 保证请求的顺序
function getSeqNum() {
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
    }
    
    source.sigBytes = 4 * source.words.length;
    return source;
}

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
};


//aes加密
function aesEncryptText(text)
{
	try {
	    var data = padText(CryptoJS.enc.Utf8.parse(text),getStringLength(text));
	    console.log(data);
		var key = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		var iv  = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		var encrypted = CryptoJS.AES.encrypt(data, key, {iv:iv , mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding});
		text = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
		// console.log(text);
		// // var key = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		// // var iv  = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		// text = CryptoJS.AES.decrypt(text, key, {iv:iv, mode: CryptoJS.mode.ECB,  padding: CryptoJS.pad.ZeroPadding});
		// if(text.words[text.words.length - 2] == 0) {
		// 	text.words[text.words.length - 1] = 0;
 		// 	}
		// console.log(text);
		// //text.words[47] = 0;
		// text = CryptoJS.enc.Utf8.stringify(text);
	}catch(err)
	{
		text = '';
	}
	return text;
}

//aes解密
function aesDecryptText(data)
{
	var typeString =  typeof data;
	//console.log(typeString);
	if(typeof data != 'string') {
		var msg_data = data.buffer.slice(data.offset, data.limit);
		var base64String = btoa(String.fromCharCode.apply(null, new Uint8Array(msg_data)));
		data = Base64.decode(base64String);
	}
	var text = '';
	try {	
		var key = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		var iv  = CryptoJS.enc.Utf8.parse('12345678901234567890123456789012');
		text = CryptoJS.AES.decrypt(data, key, {iv:iv, mode: CryptoJS.mode.ECB,  padding: CryptoJS.pad.NoPadding});
		if(text.words[text.words.length - 2] == 0) {
			text.words[text.words.length - 1] = 0;
 		}
		text = CryptoJS.enc.Utf8.stringify(text);
	}catch(err)
	{
		text = '';
	}
	return text;
}


var imConnectionUrl = 'ws://192.168.0.114:9090/chat';

var imConnection = {};
imConnection.logined = false;


//init websocket connection
function initConnection(){
	console.log('initConnection');
	if(!!imConnection.websocket)
	{
		imConnection.websocket.close();
	}
	
	imConnection.websocket = new WebSocket(imConnectionUrl);
	imConnection.websocket.binaryType = "arraybuffer"; 
	//var imConnection = new WebSocket(imConnectionUrl);
	imConnection.websocket.onopen = wsOpen;
	imConnection.websocket.onmessage = wsMessage;
	imConnection.websocket.onclose = wsClose;
}


initConnection();

var connection = imConnection;
function wsOpen (event) {
	console.log('connect to im success');
	imConnection.clientState =  UserStatType.USER_STATUS_ONLINE;
	if(imConnection.logined && !!imConnection.loginInfo) {
		relogin(function(res,error){
			if(res){
				console.log('relogin success');
			}
		});
	}

}

function wsClose (event) {
	if(!window.navigator.onLine)
	{
		imConnection.clientState = UserStatType.USER_STATUS_OFFLINE;
	}else if(imConnection.logined) {
		initConnection();
	}
}

function wsMessage (event) {
	var pdu = event.data.slice(0,16);
	var ByteBuffer =  dcodeIO.ByteBuffer;
	var pduBB = new ByteBuffer();
	pduBB.append(pdu);
	console.log("serviceId:" + pduBB.readUInt16(8)  + "  commandId:" + pduBB.readUInt16(10) + "  seqNum:" + pduBB.readUInt16(12));
	var data = {};
	data.commandId = pduBB.readUInt16(10);
	data.seqNum = pduBB.readUInt16(12);
	data.serviceId = pduBB.readUInt16(8);
	data.content = event.data;
	handleEventData(data);
}

function sendMsg(argument) {
	imConnection.websocket.send(Base64.encode(argument));
}

function sendBinaryData(binaryData)
{
	imConnection.websocket.send(binaryData);	
}


function buildPackage(req,serviceId,commandId,seqNum)
{
	var length = req.byteLength;
	var ByteBuffer =  dcodeIO.ByteBuffer;
	var bb = new ByteBuffer();
	bb.writeUInt32(length + 16);
	bb.writeUInt16(0);
	bb.writeUInt16(0);
	bb.writeUInt16(serviceId);
	bb.writeUInt16(commandId);
	bb.writeUInt16(seqNum);
	bb.writeUInt16(0);
	bb.append(req);
	return bb;
}


function loginAction(info,callback) {
	var LoginReq = IMLogin.build('IM.Login.IMLoginReq');
	info.client_version = '1.0';
	info.client_type = 1;
	info.online_status = UserStatType.USER_STATUS_ONLINE;
	imConnection.loginInfo = info;
	var loginReq = new LoginReq();
	loginReq.set("user_name",'' + info.username);
	loginReq.set("password", info.password);
	loginReq.set("online_status",UserStatType.USER_STATUS_ONLINE);
	loginReq.set("client_type",1);
	loginReq.set("client_version","1.0");

    var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
    var buffer = buildPackage(loginReq.toArrayBuffer(),ServiceID.SID_LOGIN,LoginCmdID.CID_LOGIN_REQ_USERLOGIN,sn);
	sendBinaryData(buffer.buffer);
}


function relogin(callback){
	console.log("do relogin");
	if(!!imConnection.loginInfo) {
		loginAction(imConnection.loginInfo,callback);
	}
}

//发消息的api
function sendMsgApiAction(msg,callback) {
	
	//var content = {from_user_id:imConnection.uid,to_session_id:group_id,msg_data:text,msg_type:MsgType.MSG_TYPE_GROUP_TEXT,msg_id:local_msg_id,created:Date.parse(new Date())/ 1000};
	var IMMsgData = IMMessage.build('IM.Message.IMMsgData');
	var msgData = new IMMsgData();
	var msgContent = aesEncryptText(msg.msg_data);
	msgData.set('from_user_id',msg.from_user_id);
	msgData.set('to_session_id',msg.to_session_id);
	msgData.set('msg_data', Base64.encode(msgContent));
	msgData.set('msg_type',msg.msg_type);
	msgData.set('msg_id',msg.msg_id);
	msgData.set('create_time',msg.created);

	var api = {msg:msg , callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,api);
    var buffer = buildPackage(msgData.toArrayBuffer(),ServiceID.SID_MSG,MessageCmdID.CID_MSG_DATA,sn);
	sendBinaryData(buffer.buffer);
}


//消息发送到服务器成功
function handleResForMsgAck(data) {

	var IMMsgDataAck = IMMessage.build('IM.Message.IMMsgDataAck');
	var msg = IMMsgDataAck.decode(data.content.slice(16));
		var sendMsgApi = apiHashMap.Get(data.seqNum);
		if(!!sendMsgApi) {
			sendMsgApi.msg.msg_id =  msg.msg_id;
			sendMsgApi.callback(true,sendMsgApi.msg);
			apiHashMap.Remove(data.content.seqNum);
		}
}


//获取群列表
function getGroupListApiAction(callback) {
	var IMNormalGroupListReq = IMGroup.build('IM.Group.IMNormalGroupListReq');
	var groupListReq  = new IMNormalGroupListReq();
	groupListReq.set("user_id",imConnection.uid);
	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(groupListReq.toArrayBuffer(),ServiceID.SID_GROUP,GroupCmdID.CID_GROUP_NORMAL_LIST_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}

//处理服务端返回的群列表
function handleGroupNormalList(data) {
	var IMNormalGroupListRsp = IMGroup.build('IM.Group.IMNormalGroupListRsp');
	var msg = IMNormalGroupListRsp.decode(data.content.slice(16));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp);
}


//获取群详情
function getGroupInfoApiAction(content,callback) {
	console.log(content);
	var IMGroupInfoListReq = IMGroup.build('IM.Group.IMGroupInfoListReq');
	var infolistReq = new IMGroupInfoListReq();
	infolistReq.set("user_id", imConnection.uid);
	infolistReq.set("group_version_list", content.group_version_list);
	//console.log(infolistReq);
	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(infolistReq.toArrayBuffer(),ServiceID.SID_GROUP,GroupCmdID.CID_GROUP_INFO_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}

//处理服务端返回的群详情
function handleGroupInfoRes(data) {
	var IMGroupInfoListRsp = IMGroup.build('IM.Group.IMGroupInfoListRsp');
	var msg = IMGroupInfoListRsp.decode(data.content.slice(16));
	console.log(msg);
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp);   
}

//获信息列表
function getMsgListApiAction(content,callback) {
	var IMGetMsgListReq = IMMessage.build('IM.Message.IMGetMsgListReq');
	var imgetmegListReq = new IMGetMsgListReq();
	imgetmegListReq.set('user_id', imConnection.uid);
	imgetmegListReq.set('session_type', content.session_type);
	imgetmegListReq.set('session_id', content.session_id);
	imgetmegListReq.set('msg_id_begin', content.msg_id_begin);
	imgetmegListReq.set('msg_cnt', content.msg_cnt);

	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(imgetmegListReq.toArrayBuffer(),ServiceID.SID_MSG,MessageCmdID.CID_MSG_LIST_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}

//处理服务端应答回来的消息列表
function handleResForMsgList(data) {
	var IMGetMsgListRsp = IMMessage.build('IM.Message.IMGetMsgListRsp');
	var msg = IMGetMsgListRsp.decode(data.content.slice(16));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp);   
}

//获取最近会话列表
function getRecentlySession(content,callback){
	var IMRecentContactSessionReq = IMBuddy.build('IM.Buddy.IMRecentContactSessionReq');
	var recentSessionReq = new IMRecentContactSessionReq();
	recentSessionReq.set("user_id",imConnection.uid);
	recentSessionReq.set('latest_update_time',content.latest_update_time);
	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(recentSessionReq.toArrayBuffer() ,ServiceID.SID_BUDDY_LIST ,BuddyListCmdID.CID_BUDDY_LIST_RECENT_CONTACT_SESSION_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}


function handleResForRecentlySession(data)
{
	var IMRecentContactSessionRsp = IMBuddy.build('IM.Buddy.IMRecentContactSessionRsp');
	var msg = IMRecentContactSessionRsp.decode(data.content.slice(16));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp);  
}



//获取所有好友列表(单聊的时候会用上)
function getAllFriends(content,callback){
	//content.user_id = imConnection.uid;
	var IMAllUserReq = IMBuddy.build('IM.Buddy.IMAllUserReq');
	var imAllUserReq = new IMAllUserReq();
	imAllUserReq.set('user_id',imConnection.uid);
	imAllUserReq.set('latest_update_time',0);

	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(imAllUserReq.toArrayBuffer() ,ServiceID.SID_BUDDY_LIST ,BuddyListCmdID.CID_BUDDY_LIST_ALL_USER_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}


function handleResForAllFriends(data) {
	var IMAllUserRsp = IMBuddy.build('IM.Buddy.IMAllUserRsp');
	var msg = IMAllUserRsp.decode(data.content.slice(16));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp); 
}


function getFriendsByIds(ids,callback) {
	if(!ids || ids.length == 0) {
		return;
	}
	var IMUsersInfoReq = IMBuddy.build('IM.Buddy.IMUsersInfoReq');
	var imUsersInfoReq = new IMUsersInfoReq();
	imUsersInfoReq.set('user_id',imConnection.uid);
	imUsersInfoReq.set('user_id_list',ids);
	//console.log(imUsersInfoReq);

	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(imUsersInfoReq.toArrayBuffer() ,ServiceID.SID_BUDDY_LIST ,BuddyListCmdID.CID_BUDDY_LIST_USER_INFO_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}


function handleResForFriendsByIds(data){
	var IMUsersInfoRsp = IMBuddy.build('IM.Buddy.IMUsersInfoRsp');
	var msg = IMUsersInfoRsp.decode(data.content.slice(16));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp); 
}

//获取未读消息
function getUnreadMessageCnt(content,callback){
	var IMUnreadMsgCntReq = IMMessage.build('IM.Message.IMUnreadMsgCntReq');
	var imUnreadMsgCntReq = new IMUnreadMsgCntReq();
	imUnreadMsgCntReq.set('user_id',imConnection.uid);
	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(imUnreadMsgCntReq.toArrayBuffer() ,ServiceID.SID_MSG ,MessageCmdID.CID_MSG_UNREAD_CNT_REQUEST,sn);
	sendBinaryData(buffer.buffer);
}

function handleUnReadMessageCnt(data) {
	var IMUnreadMsgCntRsp = IMMessage.build('IM.Message.IMUnreadMsgCntRsp');
	var msg = IMUnreadMsgCntRsp.decode(data.content.slice(16));
	var rsp = {};
	rsp.seqNum = data.seqNum;
	rsp.content = msg;
	simpleWorkForHandle(rsp);
}


//应答给服务端 读了这条消息
function answerMsg(content,callback){
	var IMMsgDataReadAck = IMMessage.build('IM.Message.IMMsgDataReadAck');
	var msgDataReadAck = new IMMsgDataReadAck();
	msgDataReadAck.set('user_id', imConnection.uid);
	msgDataReadAck.set('session_id', content.session_id);
	msgDataReadAck.set('msg_id', content.msg_id);
	msgDataReadAck.set('session_type', content.session_type);

	var sendMsgApi = {callback:callback};
	var sn = getSeqNum();
	apiHashMap.Set(sn,sendMsgApi);
	var buffer = buildPackage(msgDataReadAck.toArrayBuffer() ,ServiceID.SID_MSG ,MessageCmdID.CID_MSG_READ_ACK,sn);
	sendBinaryData(buffer.buffer);
}

//应答来自服务端的心跳包
function answerHeartBeat()
{
	var IMHeartBeat = IMGroup.build('IM.Other.IMHeartBeat');
	var hearBeat = new IMHeartBeat();
	var buffer = buildPackage(hearBeat.toArrayBuffer(),ServiceID.SID_OTHER,OtherCmdID.CID_OTHER_HEARTBEAT,sn);
	sendBinaryData(buffer.buffer);
}



function handleEventData(data) {
	switch(data.commandId) {
		case LoginCmdID.CID_LOGIN_RES_USERLOGIN:      //登录请求后,服务的应答
			handleResForLogin(data);
			break;
		case MessageCmdID.CID_MSG_DATA:               //服务端向客户端发的消息
			handleResForNewMsg(data);
			break;
		case MessageCmdID.CID_MSG_DATA_ACK:           //客户端发消息成功后,服务端的应答
			handleResForMsgAck(data);
			break;
		case MessageCmdID.CID_MSG_LIST_RESPONSE:      //客户端请求消息列表得到的应答
			handleResForMsgList(data);
			break;
		case MessageCmdID.CID_MSG_UNREAD_CNT_RESPONSE://客户端请求未读消息得到的应答
			handleUnReadMessageCnt(data);
			break;
		case GroupCmdID.CID_GROUP_NORMAL_LIST_RESPONSE://客户端请求群列表得到应答
			handleGroupNormalList(data);
			break;
		case GroupCmdID.CID_GROUP_INFO_RESPONSE:       //客户端请求群详情得到的应答
			handleGroupInfoRes(data);
			break;
		case BuddyListCmdID.CID_BUDDY_LIST_RECENT_CONTACT_SESSION_RESPONSE://请求最近会话列表服务端的应答
			handleResForRecentlySession(data);
			break;
		case BuddyListCmdID.CID_BUDDY_LIST_ALL_USER_RESPONSE:
			handleResForAllFriends(data);
			break;
		case BuddyListCmdID.CID_BUDDY_LIST_USER_INFO_RESPONSE:
			handleResForFriendsByIds(data);
			break;
		case OtherCmdID.CID_OTHER_HEARTBEAT:
			answerHeartBeat();
			break;
		default:
			console.log("not such commandId:" + data.commandId);
			console.log("data:" + JSON.stringify(data));
			break;
	}
}

function handleResForLogin(data) {
    var IMLoginRes = IMLogin.build('IM.Login.IMLoginRes');
	var msg = IMLoginRes.decode(data.content.slice(16));
	console.log(msg);
	if(msg) {
		var loginApi = apiHashMap.Get(data.seqNum);
		if(msg.result_code == ResultType.REFUSE_REASON_NONE) {
			imConnection.logined = true;
			imConnection.uid = msg.user_info.user_id;
			imConnection.user = msg.user_info;
			loginApi.callback(true,msg.user_info);
		}else {
			loginApi.callback(false,msg.result_string);
		}
	}
}

//收到一条新消息
function handleResForNewMsg(data) {
	if(data.content) {
		if(typeof imConnection.msgHandler === "function") {
			var IMMsgData = IMMessage.build('IM.Message.IMMsgData');
			var msg = IMMsgData.decode(data.content.slice(16));
			imConnection.msgHandler(msg);
		}
	}
}




//简单的处理了api的应答结果
function simpleWorkForHandle(data) {
	if(data.content) {
		console.log("finish api for seqNum:" + data.seqNum);
		var api = apiHashMap.Get(data.seqNum);
		if(!!api) {
			api.callback(true,data.content);
			apiHashMap.Remove(data.seqNum);    
		}
	}
}


//给指定群号发送一条消息
function sendGroupTextMsg(text,group_id,callback) {
	var content = {from_user_id:imConnection.uid,to_session_id:group_id,msg_data:text,msg_type:MsgType.MSG_TYPE_GROUP_TEXT,msg_id:local_msg_id,created:Date.parse(new Date())/ 1000};
	local_msg_id++;
	sendMsgApiAction(content,callback);
}

//给指定用户发送一条消息
function sendSingleTextMsg(text,to_user_id,callback) {
	var content = {from_user_id:imConnection.uid,to_session_id:to_user_id,msg_data:text,msg_type:MsgType.MSG_TYPE_SINGLE_TEXT,msg_id:local_msg_id,created:Date.parse(new Date())/ 1000};
	local_msg_id++;
	sendMsgApiAction(content,callback);
}




//定义的一些常量以及枚举
var DD_MESSAGE_IMAGE_PREFIX = "&$#@~^@[{:"
var DD_MESSAGE_IMAGE_SUFFIX = ":}]&$~@#@"

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



