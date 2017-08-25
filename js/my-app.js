// Initialize your app
var myApp = new Framework7();

// Export selectors engine
var $$ = Dom7;

var currentSession = {};

// Add view
var mainView = myApp.addView('.view-main', {
	// Because we use fixed-through navbar we can enable dynamic navbar
	dynamicNavbar: true
});

var client = new TeamTalkWebClient({wsurl:'ws://im.xiaominfc.com:9090'});
//client.connection();

myApp.onPageAfterAnimation('chatmain', function (page) {
	myApp.showIndicator();
	var key = currentSession.session_type + '_' + currentSession.session_id;

	currentSession.messages = imDb.getMessageBykey(key);
	if(currentSession.messages) {
		myApp.hideIndicator();
		loadMsgForChatMain(currentSession.messages,currentSession.MessagesManager);
	}else {
		var content = {session_id:currentSession.session_id,session_type:currentSession.session_type,msg_id_begin:0,msg_cnt:40};
		client.getMsgListApiAction(content,function(state,res) {
			imDb.addMessagetoDb(key,res.msgList);
			myApp.hideIndicator();
			loadMsgForChatMain(res.msgList,currentSession.MessagesManager)            
		});
	}
});


myApp.onPageAfterAnimation('home', function (page) {
	loadConcats();	
	client.getUnreadMessageCnt({},function(state,res){
		console.log(res);
	});
	loadRecentlySession();
});



client.msgHandler = function(newMsg) {
	//console.log('new msg:' + JSON.stringify(res) + ' at:' + mainView.activePage.name);
	newMsg.userId = newMsg.fromUserId;
	newMsg.type = newMsg.msgType; 
	newMsg.session_id = newMsg.toSessionId;   
	var msg_session_type = (newMsg.msgType === MsgType.MSG_TYPE_GROUP_TEXT || newMsg.type === MsgType.MSG_TYPE_GROUP_AUDIO)? SessionType.SESSION_TYPE_GROUP:SessionType.SESSION_TYPE_SINGLE;
	var msg_session_key = msg_session_type + '_' + newMsg.toSessionId;    

	if(msg_session_type === SessionType.SESSION_TYPE_SINGLE && newMsg.userId != client.uid) {
		msg_session_key = msg_session_type + '_' + newMsg.userId; 
	}
	imDb.addMessagetoDb(msg_session_key,newMsg);

	if(mainView.activePage.name == 'chatmain') {
		var key = currentSession.session_type + '_' + currentSession.session_id;
		if(key === msg_session_key) {
			loadNewMsgToChatMain(newMsg);
			return;    
		}
	}
	loadNotificationForNewMsg(newMsg);
}


function loadNotificationForNewMsg(newMsg) {
	//通知一下 有新消息    
	myApp.addNotification({
		title: '提醒',
	    message: '你有一条新的消息'
	});
}


function bindDataToContactlist(){
	//console.log('bind contact');
	var html = '';
	var user_list = imDb.getAllUserFromDb();

	for(var i in user_list){
		var user = user_list[i];

		if(parseInt(user.userId) == client.uid) {
			continue;
		}
		var item = '<li class="item-content item-link user-action" value="'+ user.userId +'">' + 
			'<div class="item-media"><img src="'+ user.avatarUrl + '" class="avatar" ></div>' +
			'<div class="item-inner">' +
			'<div class="item-title">' + user.userNickName +'</div>' +
			'</div></li>';
		html = html + item;
	}
	$$('#contact-list').html(html);
	$$('.user-action').on('click',function(ele){
		var user = imDb.getUserbyId(this.value);
		currentSession.title = user.userNickName;
		currentSession.session_id = parseInt(user.userId);
		currentSession.session_type = SessionType.SESSION_TYPE_SINGLE;
		currentSession.current_msg_id = 0;
		mainView.router.loadPage('chatmain');  
	});
}

function bindDataToGrouplist(){
	var html = '';
	var group_info_list = imDb.getAllGroupList();

	for(var i in group_info_list){
		var group_info = group_info_list[i];
		var item = '<li class="item-content item-link group-action" value="'+ i +'">' + 
			'<div class="item-media"><img src="'+ group_info.groupAvatar + '" class="avatar" ></div>' +
			'<div class="item-inner">' +
			'<div class="item-title">' + group_info.groupName +'</div>' +
			'</div></li>';
		html = html + item;
	}
	$$('#group-list').html(html);
	$$('.group-action').on('click',function(ele){
		var group_info = imDb.getAllGroupList()[this.value];
		currentSession.title = group_info.groupName;
		currentSession.session_id = group_info.groupId;
		currentSession.session_type = SessionType.SESSION_TYPE_GROUP;
		currentSession.current_msg_id = 0;
		mainView.router.loadPage('chatmain');  
	});
}

function loadConcats(){
	if((imDb.getAllGroupList()).length > 0) {
		bindDataToGrouplist();
	}else {
		
		client.getGroupListApiAction(function(state,res){
			if(state) {
				var group_version_list = [];
				for(index in res.groupVersionList) {
					var group_version = res.groupVersionList[index];
					group_version.version = 0;
					group_version_list.push(group_version);
				}
				var content = {group_version_list:group_version_list};
				client.getGroupInfoApiAction(content,function(state,res1) {
					imDb.addGroupInfoToDb(res1.groupInfoList);
					bindDataToGrouplist();
				});        
			}
		});        
	}    
}


function bindSessions(autoRemove){
	var html = '';

	var group_list = [];
	var nullUserIds = [];
	for(var i in imDb.session_list){
		var session = imDb.session_list[i];
		if(session == null) {
			continue;
		}

		var text = session.latestMsgData;
		if(!!text) {

			text = aesDecryptText(text);
			if(text.indexOf(DD_MESSAGE_IMAGE_PREFIX) == 0) {
				text = "[图片]";
			}

		}else {
			text = '';
		}

		var session_name = '未知';
		var session_avatar = ' ';
		if(session.sessionType == SessionType.SESSION_TYPE_GROUP) {
			var groupinfo = imDb.findGroupInfoById(session.sessionId);
			if(!!groupinfo) {
				session_name = groupinfo.groupName
					session_avatar = groupinfo.groupAvatar;
			}else if(autoRemove) {
				continue;
			}else {
				group_list.push({group_id:session.sessionId,version:0});
			}
		}else {
			var userinfo = imDb.getUserbyId(session.sessionId);
			if(!!userinfo) {
				session_name = userinfo.userNickName;     
				session_avatar = userinfo.avatarUrl;
			}else {
				nullUserIds.push(session.sessionId);
			}

		}

		var session_tag = 'unread_' + session.sessionType + '_' + session.sessionId;
		var item = '<li class="item-content item-link session-action" value="'+ i +'">' + 
			'<div class="item-media"><img src="'+ session_avatar + '" class="avatar" ></div>' +
			'<div class="item-inner">' +
			'<div class="item-title">' + session_name + '<div class="label">' + text +'</div></div>' +'<div class="item-after" id="' + session_tag +'"></div>' +
			'</div></li>';
		html = html + item;
	}
	$$('#session-list').html(html);

	$$('.session-action').on('click',function(ele){
		//console.log(this.value);
		var session = imDb.session_list[this.value];
		//console.log(this.value + ' session:' + JSON.stringify(session));

		currentSession.title = '';
		if(session.sessionType == SessionType.SESSION_TYPE_GROUP) {
			var groupinfo = imDb.findGroupInfoById(session.sessionId);
			currentSession.title = groupinfo.groupName;

		}else {
			var userinfo = imDb.getUserbyId(session.sessionId);
			currentSession.title = userinfo.userNickName;
		}
		currentSession.session_id = session.sessionId;
		currentSession.session_type = session.sessionType;
		currentSession.current_msg_id = session.latestMsgId;
		mainView.router.loadPage('chatmain');  
	});

	if(group_list.length > 0 && !autoRemove) {
		var content = {group_version_list:group_list};
		client.getGroupInfoApiAction(content,function(state,res) {
			imDb.addGroupInfoToDb(res.groupInfoList);
			bindSessions(true);
		});
	}
	if(nullUserIds.length > 0 && !autoRemove) { 
		client.getFriendsByIds(nullUserIds,function(state,res){
			var users = res.userInfoList;
			for(var id in users) {
					var user = users[id];
					imDb.addUsertoDb(user.userId,user);

			}
			bindSessions(true);
		});
	}

	if(!autoRemove) {
		client.getUnreadMessageCnt({},function(state,res){
			for(var index in res.unreadinfoList) {

				var unreadinfo = res.unreadinfoList[index];
				var session_tag = 'unread_' + unreadinfo.sessionType + '_' + unreadinfo.sessionId;
				$$('#' + session_tag).html('<span class="badge" >' + unreadinfo.unreadCnt +'</span>');

			}
		});
	} 

}

function loadRecentlySession(){
	if(imDb.session_list) {
		bindSessions(false);
	}else {
		client.getRecentlySession({user_id:client.uid,latest_update_time:0},function(state,res){
			console.log(res);
			imDb.session_list = res.contactSessionList;
			bindSessions(false);
		});
	}
}


function loadNewMsgToChatMain(newMsg){
	var msg = {};
	var senderId = newMsg.userId;
	var user = imDb.getUserbyId(senderId);
	if(!!user) {
		msg.avatar = user.avatarUrl;
		msg.name = user.userNickName;
	}else {
		msg.name = senderId;
		msg.avatar = '';
	}
	var text = aesDecryptText(newMsg.msgData);
	console.log('text:' + text);
	if(newMsg.type == MsgType.MSG_TYPE_GROUP_TEXT || newMsg.type == MsgType.MSG_TYPE_SINGLE_TEXT) {
		if(text.indexOf(DD_MESSAGE_IMAGE_PREFIX) == 0) {

			var index = text.indexOf('{') + 2;
			var img = text.substr(index,text.lastIndexOf('}') - 1 - index);
			//var img = text.substr(10,text.length - 19);
			//console.log(img);
			msg.text = '<img src="' + img +'" />';
			msg.hasImage = true;
		}else {
			msg.text = text;        
		}
	}else {
		
		var dv = new DataView(newMsg.msgData.slice(0,4).buffer);
		var audioTime = dv.getUint32(0) + '秒';
		msg.text = "<div class='audio-item' id='item-"+newMsg.msgId+"' >[语音:" + audioTime +"]</div>";        
	}
	

	if(client.uid == senderId) {
		msg.type = 'sent';
	}else {
		msg.type = 'received';
	}
	msg.senderId = senderId;
	var time = new Date(newMsg.created * 1000).toLocaleString().split(', ');
	msg.day = time[0];
	msg.time = time[1];

	currentSession.MessagesManager.addMessage(msg);
	$$('#item-'+newMsg.msgId).on('click',function(ele){
		var data  = newMsg.msgData;
		playSound(data.slice(4));
	});
	client.answerMsg({session_type:currentSession.session_type,session_id:newMsg.toSessionId,msg_id:newMsg.msgId},function(state,res){
		console.log('finish answer:' + JSON.stringify(res));
	});
}


myApp.onPageInit('home', function (page) {
	console.log("showHome");

	$$('#session-tab').on('show', function () {
		$$('#home-top-title').text('IM');
	});

	$$('#contact-tab').on('show', function () {
		$$('#home-top-title').text('联系人');
		bindDataToContactlist();
	});


});

myApp.onPageInit('chatmain', function (page) {
	currentSession.MessagesManager = myApp.messages('.messages', {
		autoLayout: true,
		messageTemplate:'{{#if day}}'+
		'<div class="messages-date">{{day}} {{#if time}}<span>{{time}}</span>{{/if}}</div>' +
		'{{/if}}' +
		'<div class="message message-{{type}} {{#if hasImage}}message-pic{{/if}} {{#if avatar}}message-with-avatar{{/if}} {{#if position}}message-appear-from-{{position}}{{/if}}">'+
		'{{#if name}}<div class="message-name {{#if senderId}}message-sender-{{senderId}}{{/if}}">{{name}}</div>{{/if}}' +
		'<div class="message-text">{{text}}</div>' +
		'<div class="message-avatar {{#if senderId}}message-avatar-{{senderId}}{{/if}}" style="background-image:url({{avatar}})"></div>' +
		'{{#if label}}<div class="message-label">{{label}}</div>{{/if}}</div>'

	});

	

	var myMessagebar = myApp.messagebar('.messagebar');
	console.log(currentSession);
	console.log('title:' + currentSession.title);
	$$('.top-title').html(currentSession.title);

	// Handle message
	$$('.messagebar .link').on('click', function () {
		// Message text
		var messageText = myMessagebar.value().trim();
		// Exit if empy message
		if (messageText.length === 0) return;

		// Empty messagebar
		myMessagebar.clear()

		// 随机消息类型

		var messageType = 'sent';

		var senderId = client.uid;
		var user = imDb.getUserbyId(senderId);
		var avatar, name;
		if(!!user) {
			avatar = user.avatar_url;
			name = user.user_nick_name;
		}

		var time = new Date().toLocaleString().split(', ');


		currentSession.MessagesManager.addMessage({
			// Message text
			text: messageText,
			// 消息类型
			type: messageType,
			// 头像和名称
			avatar: avatar,
			name: name,
			senderId:senderId,
			// 日期
			day:time[0],
			time:time[1],
		});


		if(currentSession.session_type == SessionType.SESSION_TYPE_GROUP) {
			client.sendGroupTextMsg(messageText,currentSession.session_id,function(state,res){
				if(state) {
					console.log('send ok:' + JSON.stringify(res)); 
					res.userId = res.fromUserId;
					res.msgData = Base64.encode(res.msgData);
					res.type = res.msgType;
					res.sessionId = res.toSessionId;
					var key = currentSession.session_type + '_' + currentSession.session_id;
					imDb.addMessagetoDb(key,res);   
				}
			});
		}else {
			client.sendSingleTextMsg(messageText,currentSession.session_id,function(state,res){
				if(state) {
					console.log(res);
					//console.log('send ok:' + JSON.stringify(res)); 
					res.userId = res.fromUserId;
					res.msgData = Base64.encode(res.msgData);
					res.type = res.msgType;
					res.sessionId = res.toSessionId;
					var key = currentSession.session_type + '_' + currentSession.session_id;
					imDb.addMessagetoDb(key,res);   
				}else {
					console.log('send failed');
				}
			});
		}
	});
});

window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;
var audioContext = new window.AudioContext();

function playSound(soundBuffer) {
	audioContext.decodeAudioData(soundBuffer.buffer,function(audioBuffer){
		console.log(audioBuffer);
		var sourceNode = audioContext.createBufferSource();  
		sourceNode.connect(audioContext.destination);
		sourceNode.buffer = audioBuffer;
		sourceNode.start();
	})
}

function loadMsgForChatMain(msgs,messagesContainer) {
	var nullUserIds = [];

	for(var i in msgs) {
		if(msgs[i].msgId > currentSession.current_msg_id){
			currentSession.current_msg_id = msgs[i].msgId;
		}
		var msg = {}; 
		var sender = msgs[i].fromSessionId;
		var userInfo = imDb.getUserbyId('' + sender);
		//var text = '';
		//console.log('text:' + text);
		if(msgs[i].msgType == MsgType.MSG_TYPE_GROUP_TEXT || msgs[i].msgType == MsgType.MSG_TYPE_SINGLE_TEXT) {
			//console.log(msgs[i].msgData);
			var text = aesDecryptText(msgs[i].msgData);
			if(text.indexOf(DD_MESSAGE_IMAGE_PREFIX) == 0) {
			
				var index = text.indexOf('{') + 2;
				var img = text.substr(index,text.lastIndexOf('}') - 1 - index);
				console.log(img);
				msg.text = '<img src="' + img +'" />';
				msg.hasImage = true;
			}else {
				msg.text = text;        
			}
		}else {
			var dv = new DataView(msgs[i].msgData.slice(0,4).buffer);
			var audioTime = dv.getUint32(0) + '秒';
			msg.text = "<div class='audio-item' value="+i+" >[语音:" + audioTime +"]</div>";    
		}
		if(userInfo) {
			msg.name = userInfo.userNickName;
			msg.avatar = userInfo.avatarUrl;
		}else {
			nullUserIds.push(sender);
			msg.name = sender;
			msg.avatar = '';
		}
		if(client.uid == sender) {
			msg.type = 'sent';
		}else {
			msg.type = 'received';
		}
		msg.label = '';
		msg.senderId = sender;
		var time = new Date(msgs[i].createTime * 1000).toLocaleString().split(', ');
		msg.day = time[0];
		msg.time = time[1];
		messagesContainer.addMessage(msg,'prepend');
	}

	$$('.audio-item').on('click',function(ele){
		//console.log(this.getAttribute('value'));
		var index = this.getAttribute('value');
		var data  = msgs[index].msgData;
		playSound(data.slice(4));
	});

	client.answerMsg({session_type:currentSession.session_type,session_id:currentSession.session_id,msg_id:currentSession.current_msg_id},function(state,res){
		console.log('finish answer:' + JSON.stringify(res));
	});

	client.getFriendsByIds(nullUserIds,function(state,res){

		var users = res.userInfoList;
		for(var id in users) {
			var user = users[id];
			imDb.addUsertoDb(user.userId,user);
			$$('.message-sender-' + id).html(user.userNickName);
			$$('.message-avatar-' + id).css('background-image', 'url(' + user.avatarUrl + ')');
		}
	});
}


function showHome(){
	mainView.router.loadPage('home');   
}


function doLogin(formData){
	var imLoginData = {username:formData.username,password:md5(formData.password)};
	console.log(imLoginData);
	client.loginAction(imLoginData,function(state,resData){
		if(state) {
			imDb.initDb(client.uid);
			myApp.hideIndicator();
			showHome();
			
			client.getAllFriends({},function(state,res){
				//console.log(res);
				var users = res.userList;
				for(var id in users) {
					var user = users[id];
					imDb.addUsertoDb(user.userId,user);

				}
			});
			
		}else {
			myApp.hideIndicator();
			alert(resData);
		}
	});    
}


function waitWSConnectionForLogin(formData) {
	setTimeout(function(){
		if(client.wsIsReady()) {
			doLogin(formData);
			return;
		}else {
			waitWSConnectionForLogin(formData);
		}
	},1000);
}

$$('.login-action').on('click', function () {
	var formData = myApp.formToJSON('#login-form');
	if(client.logined) {
		showHome();
		return;
	}
	myApp.showIndicator();
	if(client.wsIsReady()) {
		doLogin(formData);
	}else {
		waitWSConnectionForLogin(formData);
	}
});
