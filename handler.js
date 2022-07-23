'use strict';

require('dotenv').config();
const readline = require('readline');
const {MTProto} = require( 'telegram-mtproto');
const sessionstorage = require( 'sessionstorage');
const delay = require( 'delay' );
const fs = require('fs');
const _ = require('lodash');
const AWS = require("aws-sdk");


const bucket = process.env.BUCKET;
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
});

const api = {
  layer          : 57,
  initConnection : 0x69796de9,
  api_id         : parseInt(process.env.TELEGRAM_APP_ID,10)
}

const server = {
  dev: false 
}
const sessionfilename = "telegram/"+process.env.TELEGRAM_PHONE_NUMBER+".json";
const datafilename = "telegram/"+process.env.TELEGRAM_PHONE_NUMBER+"_data";

const telegram = MTProto({ server, api })


const checkEnv = ()=>{
  if(!process.env.TELEGRAM_PHONE_NUMBER 
    || !process.env.TELEGRAM_APP_ID
    || !process.env.TELEGRAM_APP_HASH
    ){

    console.log("Please set up your environment variables first.")
    return false
  } else return true
}


const checkIfFileExists = async (filename) =>{
  const params = {
        Bucket: bucket,
        Key: filename 
  }
  try { 
      await s3.headObject(params).promise()
      //console.log("A file in same name already exists in bucket.")
      return true
    
  } catch (err) {
        //console.log("No file in same name found")
        return false
  }   
}

const createFileInS3 = async (filename, jsondata, filetype) => {
  const params = {
        Bucket: bucket,
        Key: filename 
  }
 
  return s3
        .putObject({
            Bucket: bucket,
            Key: filename,
            Body: jsondata
        }).promise()   
}

const getPhoneCodeFromS3 = async ()=>{
  let params = {Bucket: bucket, Key: sessionfilename};
  return s3.getObject(params).promise();
}

const checkLogin = async() => {
  try{
      const { phone_code_hash } = await telegram('auth.sendCode', {
        phone_number  : process.env.TELEGRAM_PHONE_NUMBER,
        sms_type: 5,
        current_number: true,
        api_id        : parseInt(process.env.TELEGRAM_APP_ID,10),
        api_hash      : process.env.TELEGRAM_APP_HASH
      })
      

      let teleData = { 
          phone_code: '',
          //signed_in: false
      };
      

      let data = JSON.stringify(teleData);
      let isSessionCreated = await createFileInS3(sessionfilename, data, "sessionCreate")
      
      if (!isSessionCreated.ETag || isSessionCreated.ETag.length  == 0 ){
        console.log("Error in creating session file ")
        console.log(isSessionCreated)
        return false
      }
      console.log("session created : ", isSessionCreated)
      console.log('Code sent to phone number. Please add it to '+sessionfilename+' file within '+parseInt(process.env.DELAY) /60000+' min(s).') 

      let delaySeconds = process.env.DELAY ? parseInt(process.env.DELAY) : 60000;
      await delay(delaySeconds);
      
      //console.log("phone code from env : ", process.env.PHONE_CODE);
      let phoneCodeBuff = await getPhoneCodeFromS3()
      const phnData = JSON.parse(phoneCodeBuff.Body);
      console.log("phone code : ", phnData.phone_code);

      if(!phnData.phone_code){
        console.log('No phone code found in '+sessionfilename+'...')
        return false
      }
      const { user } = await telegram('auth.signIn', {
        phone_number   : process.env.TELEGRAM_PHONE_NUMBER,
        phone_code_hash: phone_code_hash,
        phone_code     : phnData.phone_code
      })    
      if(user && user.id){
          console.log('signed as : , ', user)
          return true
      }else return false

      return false

    }catch(err){
      console.log('Error in signing')
      console.error(err);
      return false
  }
}


const getAllChats = async(init, lstMsg) =>{

  console.log("Inside getAllChats : ", init)

  const dialogs = await telegram('messages.getDialogs', {
      limit: process.env.DIALOG_LIMIT ? parseInt(process.env.DIALOG_LIMIT,10) : 100,
    })
  const allHistory = await Promise.all(_.compact(_.map(dialogs.chats, async (eachChatGroup)=>{
    //console.log("Each chat group : ", eachChatGroup._, )
    //console.log("=============================== ")

    if (eachChatGroup._ != "chatForbidden" && eachChatGroup.id && eachChatGroup.access_hash){
      try {
        let channelDet = {};
        let offSetVal = 0;
        if(!init){
           channelDet = _.find(lstMsg, function(u) {
              if(u.channels.channel_id == eachChatGroup.id){
                return u; 
              }
          });
        }
        

        console.log("Found current channel : ", channelDet)
        if(channelDet && channelDet.channels){
          offSetVal = parseInt(channelDet.channels.channel_last_msg_id)+ 1;
          console.log("Current offSet: ", offSetVal)
        }

        let history = await telegram('messages.getHistory', {
          peer: {
            _: 'inputPeerChannel',
            channel_id: eachChatGroup.id,
            access_hash: eachChatGroup.access_hash
          },
          
          offset_id: init ? 0 : offSetVal,
          limit: process.env.MESSAGE_LIMIT ? parseInt(process.env.MESSAGE_LIMIT,10) : 99
        })

        console.log("match history id with channel id : ",history.messages[0].id, (channelDet.channels ? channelDet.channels.channel_last_msg_id: "" ))
        if(!init && history && channelDet && (history.messages[0].id == channelDet.channels.channel_last_msg_id)){
            console.log("No new messages found.");
            return {}
        
        } else{


        


        let last_msg_id = history.messages[0].id
        console.log("Last message id : ", last_msg_id)
        let msgs = _.compact(_.map(history.messages, (msgs)=>{    
          let from_user = {}
          if(msgs.from_id){

            let users = _.find(history.users, function(u) { 
              if(u.id == msgs.from_id){
                return u; 
              }

            });
            from_user = {
                  first_name: users.first_name,
                  last_name: users.last_name,
                  username: users.username,
                  id: users.id
              }
            //console.log("found user : ", from_user)

          }

          let caption = msgs.media && msgs.media.caption ? msgs.media.caption.replace(/\n/g, " ") : "";
          let msg = msgs.message && msgs.message.length> 0  ? msgs.message.replace(/\n/g, " ") : "";

          let msg_formatted = msg + " "+ caption;
          if(msg_formatted.length > 1){
            let cleanMsg = {
              message_text : msg + " "+ caption,
              date : msgs.date,
              date_formatted: new Date(msgs.date * 1000).toLocaleString("en-US"),
              id: msgs.id,
              from_user: from_user
            }

            return cleanMsg;
          }          

        }))

        let historyMod = {
          messages :JSON.stringify(msgs),
          channels: {
            channel_title: eachChatGroup.title,
            channel_id: eachChatGroup.id,
            channel_username: eachChatGroup.username,
            channel_last_msg_id: last_msg_id 
          },
          
        }
        return historyMod;
      }

      }catch (err){
        console.log('Error in getting messages')
        console.error(err);
        return []
      }
    }
    
  })
  )
  );

    let lastMsgs = _.compact(_.map(allHistory, (each)=>{
      if(each && each.channels && each.channels.channel_id)
        return _.pick(each, ['channels'])
    }));

    if(lastMsgs.length > 0){
      console.log("Create new log file")
      let currTime = Date.now()
      let messages = {
        phone_number: process.env.TELEGRAM_PHONE_NUMBER,
        channel_data : _.compact(allHistory)
    }
  
    let isDataCreated = await createFileInS3(datafilename+"_"+currTime+".json", JSON.stringify(messages), "dataFile")

    if (!isDataCreated.ETag || isDataCreated.ETag.length  == 0 ){
        console.log("Error in saving data file at "+Date.now().toLocaleString())
        console.log(isDataCreated)
        //return false
    }
    console.log('Data file saved at : ')
    //let now = Date.now().toLocaleString('en-US', { timeZone: "Asia/Delhi" })
    console.log(Date(Date.now()).toLocaleString('en-US', { timeZone: "Asia/Delhi" }))

    return lastMsgs;
  } else {
    console.log("No new messages found to save.")
    return null

  }
  
}

const checkIfLoggedIn = async () =>{
  return await checkLogin()
}

module.exports.scrape = (event) => {
    let preReq = checkEnv()
    if(!preReq){
      return false
    }
    let isLogged = await checkIfLoggedIn()
    let lstMsg = []
    let lstMessageStore = []
    
    if(isLogged) {
        console.log("calling dialogs.")
        lstMsg = await getAllChats(true, lstMsg);

        if(lstMsg && lstMsg.length > 0){
          lstMessageStore = lstMsg
        }
    }else {
      console.log("Error in user signing...")
      return false
    }
    
    let interval = process.env.CALL_INTERVAL ? parseInt(process.env.CALL_INTERVAL) : 86400000;


    setInterval(async function tick() {
      console.log("Inside timeout...")
      lstMsg = await getAllChats(false, lstMessageStore);
      if(lstMsg && lstMsg.length > 0){
          lstMessageStore = lstMsg
      }
    }, 
    interval); 
};

