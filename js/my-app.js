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


myApp.onPageAfterAnimation('chatmain', function (page) {
	//console.log('pageAfterAnimation');
	myApp.showIndicator();
	var key = currentSession.session_type + '_' + currentSession.session_id;

	currentSession.messages = imDb.getMessageBykey(key);
	if(currentSession.messages) {
		myApp.hideIndicator();
		loadMsgForChatMain(currentSession.messages,currentSession.MessagesManager);
	}else {
		var content = {session_id:currentSession.session_id,session_type:currentSession.session_type,msg_id_begin:0,msg_cnt:40};
		getMsgListApiAction(content,function(state,res1) {
			imDb.addMessagetoDb(key,res1.msg_list);
			myApp.hideIndicator();
			loadMsgForChatMain(res1.msg_list,currentSession.MessagesManager)            
		});
	}
});


myApp.onPageAfterAnimation('home', function (page) {
	loadConcats();	
	getUnreadMessageCnt({},function(state,res){
		console.log(res);
	});
	loadRecentlySession();
});



connection.msgHandler = function(res) {
	//console.log('new msg:' + JSON.stringify(res) + ' at:' + mainView.activePage.name);
	res.user_id = res.from_user_id;
	res.type = res.msg_type; 
	res.session_id = res.to_session_id;   
	var msg_session_type = (res.msg_type === MsgType.MSG_TYPE_GROUP_TEXT || res.type === MsgType.MSG_TYPE_GROUP_AUDIO)? SessionType.SESSION_TYPE_GROUP:SessionType.SESSION_TYPE_SINGLE;
	var msg_session_key = msg_session_type + '_' + res.to_session_id;    

	if(msg_session_type === SessionType.SESSION_TYPE_SINGLE && res.user_id != connection.uid) {
		msg_session_key = msg_session_type + '_' + res.user_id; 
	}
	imDb.addMessagetoDb(msg_session_key,res);

	if(mainView.activePage.name == 'chatmain') {
		var key = currentSession.session_type + '_' + currentSession.session_id;
		if(key === msg_session_key) {
			loadNewMsgToChatMain(res);
			return;    
		}
	}
	loadNotificationForNewMsg(res);
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

		if(parseInt(user.user_id) == connection.uid) {
			continue;
		}
		var item = '<li class="item-content item-link user-action" value="'+ user.user_id +'">' + 
			'<div class="item-media"><img src="'+ user.avatar_url + '" class="avatar" ></div>' +
			'<div class="item-inner">' +
			'<div class="item-title">' + user.user_nick_name +'</div>' +
			'</div></li>';
		html = html + item;
	}
	$$('#contact-list').html(html);
	$$('.user-action').on('click',function(ele){
		var user = imDb.getUserbyId(this.value);
		currentSession.title = user.user_nick_name;
		currentSession.session_id = parseInt(user.user_id);
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
			'<div class="item-media"><img src="'+ group_info.group_avatar + '" class="avatar" ></div>' +
			'<div class="item-inner">' +
			'<div class="item-title">' + group_info.group_name +'</div>' +
			'</div></li>';
		html = html + item;
	}
	$$('#group-list').html(html);
	$$('.group-action').on('click',function(ele){
		var group_info = imDb.getAllGroupList()[this.value];
		currentSession.title = group_info.group_name;
		currentSession.session_id = group_info.group_id;
		currentSession.session_type = SessionType.SESSION_TYPE_GROUP;
		currentSession.current_msg_id = 0;
		mainView.router.loadPage('chatmain');  
	});
}

function loadConcats(){
	if((imDb.getAllGroupList()).length > 0) {
		bindDataToGrouplist();
	}else {
		
		getGroupListApiAction(function(state,res){
			if(state) {
				var group_version_list = [];
				for(index in res.group_version_list) {
					var group_version = res.group_version_list[index];
					group_version.version = 0;
					group_version_list.push(group_version);
				}
				var content = {group_version_list:group_version_list};
				getGroupInfoApiAction(content,function(state,res1) {
					imDb.addGroupInfoToDb(res1.group_info_list);
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

		var text = session.latest_msg_data;
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
		if(session.session_type == SessionType.SESSION_TYPE_GROUP) {
			var groupinfo = imDb.findGroupInfoById(session.session_id);
			if(!!groupinfo) {
				session_name = groupinfo.group_name
					session_avatar = groupinfo.group_avatar;
			}else if(autoRemove) {
				continue;
			}else {
				group_list.push({group_id:session.session_id,version:0});
			}
		}else {
			var userinfo = imDb.getUserbyId(session.session_id);
			if(!!userinfo) {
				session_name = userinfo.user_nick_name;     
				session_avatar = userinfo.avatar_url;
			}else {
				nullUserIds.push(session.session_id);
			}

		}

		var session_tag = 'unread_' + session.session_type + '_' + session.session_id;
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
		if(session.session_type == SessionType.SESSION_TYPE_GROUP) {
			var groupinfo = imDb.findGroupInfoById(session.session_id);
			currentSession.title = groupinfo.group_name;

		}else {
			var userinfo = imDb.getUserbyId(session.session_id);
			currentSession.title = userinfo.user_nick_name;
		}
		currentSession.session_id = session.session_id;
		currentSession.session_type = session.session_type;
		currentSession.current_msg_id = session.latest_msg_id;
		mainView.router.loadPage('chatmain');  
	});

	if(group_list.length > 0 && !autoRemove) {
		var content = {group_version_list:group_list};
		getGroupInfoApiAction(content,function(state,res1) {
			imDb.addGroupInfoToDb(res1.group_info_list);
			bindSessions(true);
		});
	}
	if(nullUserIds.length > 0 && !autoRemove) { 
		getFriendsByIds(nullUserIds,function(state,res){
			var users = res.user_info_list;
			for(var id in users) {
					var user = users[id];
					imDb.addUsertoDb(user.user_id,user);

			}
			bindSessions(true);
		});
	}

	if(!autoRemove) {
		getUnreadMessageCnt({},function(state,res){
			for(var index in res.unreadinfo_list) {

				var unreadinfo = res.unreadinfo_list[index];
				var session_tag = 'unread_' + unreadinfo.session_type + '_' + unreadinfo.session_id;
				$$('#' + session_tag).html('<span class="badge" >' + unreadinfo.unread_cnt +'</span>');

			}
		});
	} 

}

function loadRecentlySession(){
	if(imDb.session_list) {
		bindSessions(false);
	}else {
		getRecentlySession({user_id:connection.uid,latest_update_time:0},function(state,res){
			imDb.session_list = res.contact_session_list;
			bindSessions(false);
		});
	}
}


function loadNewMsgToChatMain(newMsg){
	var msg = {};
	var senderId = newMsg.user_id;
	var user = imDb.getUserbyId(senderId);
	if(!!user) {
		msg.avatar = user.avatar_url;
		msg.name = user.user_nick_name;
	}else {
		msg.name = senderId;
		msg.avatar = '';
	}
	var text = aesDecryptText(newMsg.msg_data);

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
		msg.text = '[语音]';    
	}

	if(connection.uid == senderId) {
		msg.type = 'sent';
	}else {
		msg.type = 'received';
	}
	msg.senderId = senderId;
	var time = new Date(newMsg.created * 1000).toLocaleString().split(', ');
	msg.day = time[0];
	msg.time = time[1];

	currentSession.MessagesManager.addMessage(msg);
	answerMsg({session_type:currentSession.session_type,session_id:newMsg.to_session_id,msg_id:newMsg.msg_id},function(state,res){
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

	var senderId = connection.uid;
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
		// 随机消息类型
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
		sendGroupTextMsg(messageText,currentSession.session_id,function(state,res){
			if(state) {
				console.log('send ok:' + JSON.stringify(res)); 
				res.user_id = res.from_user_id;
				res.msg_data = Base64.encode(res.msg_data);
				res.type = res.msg_type;
				res.session_id = res.to_session_id;
				var key = currentSession.session_type + '_' + currentSession.session_id;
				imDb.addMessagetoDb(key,res);   
			}
		});
	}else {
		sendSingleTextMsg(messageText,currentSession.session_id,function(state,res){
			if(state) {
				console.log('send ok:' + JSON.stringify(res)); 
				res.user_id = res.from_user_id;
				res.msg_data = Base64.encode(res.msg_data);
				res.type = res.msg_type;
				res.session_id = res.to_session_id;
				var key = currentSession.session_type + '_' + currentSession.session_id;
				imDb.addMessagetoDb(key,res);   
			}else {
				console.log('send failed');
			}
		});
	}
	});  

	
});




function loadMsgForChatMain(msgs,messagesContainer) {
	var nullUserIds = [];

	for(var i in msgs) {
		if(msgs[i].msg_id > currentSession.current_msg_id){
			currentSession.current_msg_id = msgs[i].msg_id;
		}
		var msg = {}; 
		var sender = msgs[i].from_session_id;
		var userInfo = imDb.getUserbyId('' + sender);
		var text = aesDecryptText(msgs[i].msg_data);
		if(msgs[i].msg_type == MsgType.MSG_TYPE_GROUP_TEXT || msgs[i].msg_type == MsgType.MSG_TYPE_SINGLE_TEXT) {
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
			msg.text = '[语音]';    
		}
		if(userInfo) {
			msg.name = userInfo.user_nick_name;
			msg.avatar = userInfo.avatar_url;
		}else {
			nullUserIds.push(sender);
			msg.name = sender;
			msg.avatar = '';
		}
		if(connection.uid == sender) {
			msg.type = 'sent';
		}else {
			msg.type = 'received';
		}
		msg.label = '';
		msg.senderId = sender;
		var time = new Date(msgs[i].create_time * 1000).toLocaleString().split(', ');
		msg.day = time[0];
		msg.time = time[1];
		messagesContainer.addMessage(msg,'prepend');
	}

	answerMsg({session_type:currentSession.session_type,session_id:currentSession.session_id,msg_id:currentSession.current_msg_id},function(state,res){
		console.log('finish answer:' + JSON.stringify(res));
	});

	getFriendsByIds(nullUserIds,function(state,res){

		var users = res.user_info_list;
		for(var id in users) {
			var user = users[id];
			imDb.addUsertoDb(user.user_id,user);
			$$('.message-sender-' + id).html(user.user_nick_name);
		$$('.message-avatar-' + id).css('background-image', 'url(' + user.avatar_url + ')');

		}
	});
}


function showHome(){
	mainView.router.loadPage('home');   
}


$$('.login-action').on('click', function () {
	var formData = myApp.formToJSON('#login-form');
	if(connection.logined) {
		showHome();
		return;
	}
	myApp.showIndicator();
	var imLoginData = {username:formData.username,password:md5(formData.password)};
	console.log(imLoginData);
	loginAction(imLoginData,function(state,resData){
		if(state) {
			imDb.initDb();
			myApp.hideIndicator();
			showHome();
			
			getAllFriends({},function(state,res){
				//console.log(res);
				var users = res.user_list;
				for(var id in users) {
					var user = users[id];
					imDb.addUsertoDb(user.user_id,user);

				}
			});
			
		}else {
			myApp.hideIndicator();
			alert(resData);
		}
	});    

});
