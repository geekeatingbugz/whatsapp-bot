require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './sessions', cleanup: true }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

const groupMemory = {
  lastActive: {},
  insideJokes: {},
  relationships: {}
};

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('🔍 Scan the QR code above with your phone!');
});

client.on('authenticated', () => {
  console.log('✅ Authentication successful!');
});

client.on('ready', () => {
  console.log('🔥 Bot Activated! Use your personal account in groups');
  console.log('⚡ Commands: !help, !roast, !compliment, !wordchain');
});

client.on('message', async msg => {
  try {
    if (msg.fromMe && !msg.body.startsWith('!')) return;
    const chat = await msg.getChat();
    const isGroup = chat.isGroup;
    const sender = msg.author || msg.from;
    const body = msg.body.toLowerCase();

    console.log(`📩 [${isGroup ? 'GROUP' : 'DM'}] ${sender}: ${body}`);

    if (isGroup) {
      const groupId = chat.id._serialized;
      if (!groupMemory.insideJokes[groupId]) groupMemory.insideJokes[groupId] = [];
      if (!groupMemory.relationships[groupId]) groupMemory.relationships[groupId] = {};
      groupMemory.lastActive[groupId] = Date.now();
      if (!groupMemory.relationships[groupId][sender]) {
        groupMemory.relationships[groupId][sender] = 0;
      }
      groupMemory.relationships[groupId][sender]++;
      if (msg.body.length < 30 && (body.includes('😂') || body.includes('lol'))) {
        groupMemory.insideJokes[groupId].push(msg.body);
        console.log(`💡 Learned phrase: "${msg.body}" in group ${groupId}`);
      }
    }

    if (body.includes('@9950757442') || body.includes('9950757442')) {
      console.log(`🔔 Mention detected in ${isGroup ? 'group' : 'DM'}`);
      await safeReply(msg, "📢 Hey I see someone mentioned you!");
      const gifs = [
        'https://media.giphy.com/media/l0MYEqEzwMWFCg8rm/giphy.gif',
        'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
        'https://media.giphy.com/media/l1J9HWBKLp20YfNAY/giphy.gif'
      ];
      const gifUrl = gifs[Math.floor(Math.random() * gifs.length)];
      await msg.reply(gifUrl);
    }

    if (body.startsWith('!')) {
      console.log(`⚡ Command received: ${body}`);
      await handleCommand(msg, chat);
    }

    if (isGroup && Math.random() < 0.03) {
      console.log('🎲 Sending random comment');
      const response = await generateResponse("Random comment", chat);
      await safeReply(msg, response);
    }
  } catch (err) {
    console.error('🚨 Message handling error:', err);
  }
});

async function generateResponse(context, chat) {
  try {
    console.log('🧠 Generating AI response...');
    const groupId = chat.id._serialized;
    const memory = groupMemory.insideJokes[groupId] || [];
    const jokes = memory.slice(-3).join(', ') || "nothing yet";
    const prompt = `<|system|>\nYou're the sassy friend in a WhatsApp group. \nRespond with 1-2 sentences using humor and sarcasm.\nContext: ${context}\nInside jokes: ${jokes}</s>\n<|user|>\nSay something fitting</s>\n<|assistant|>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${process.env.HF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 100,
            temperature: 0.7,
            top_p: 0.9,
            repetition_penalty: 1.2
          }
        })
      }
    );

    clearTimeout(timeout);

    const data = await response.json();

    if (data.error) {
      console.error('🤖 Hugging Face error:', data.error);
      return "🧠 My AI brain is loading... try again later!";
    }

    const responseText = data[0]?.generated_text?.split('</s>')[0]?.trim() || "💀 Brain freeze! Try again?";
    console.log(`🤖 AI response: ${responseText}`);
    return responseText;

  } catch (err) {
    console.error('🚨 AI generation error:', err);
    return "mujhe ghr jana hai!";
  }
}

async function handleCommand(msg, chat) {
  const body = msg.body.toLowerCase();
  const command = body.split(' ')[0];
  const args = msg.body.slice(command.length).trim();

  switch(command) {
    case '!roast':
      const target = args || msg.author || "everyone";
      const roast = await generateResponse(`Roast ${target}`, chat);
      await safeReply(msg, `${roast} 🔥`);
      break;

    case '!wordchain':
      startWordChain(chat);
      await safeReply(msg, "🔤 Word Chain started! First word: *start*\nNext word must begin with 't'");
      break;

    case '!compliment':
      const person = args || msg.author || "everyone";
      const compliment = await generateResponse(`Compliment ${person} sincerely`, chat);
      await safeReply(msg, `${compliment} 💖`);
      break;

    case '!help':
      await safeReply(msg, "💎 *Bot Commands:*\n" +
        "`!roast [name]` - Spicy roast\n" +
        "`!wordchain` - Start word game\n" +
        "`!compliment` - Spread positivity\n" +
        "`!help` - Show this menu");
      break;

    default:
      await safeReply(msg, `🤔 Unknown command! Try !help for options`);
  }
}

const activeGames = {};

function startWordChain(chat) {
  activeGames[chat.id._serialized] = {
    lastWord: 'start',
    players: []
  };
}

async function safeReply(originalMsg, response) {
  return new Promise(resolve => {
    const delay = 2000 + Math.random() * 5000;
    console.log(`⏳ Replying in ${Math.round(delay/1000)}s...`);
    setTimeout(async () => {
      try {
        await originalMsg.reply(response);
        console.log('✅ Reply sent');
        resolve();
      } catch (err) {
        console.error('🚨 Reply failed:', err);
      }
    }, delay);
  });
}

client.initialize();

let restartAttempts = 0;
process.on('uncaughtException', (err) => {
  console.error('💥 CRITICAL ERROR:', err);
  if (restartAttempts < 3) {
    restartAttempts++;
    console.log(`🔄 Restarting bot (Attempt ${restartAttempts}) in 10 seconds...`);
    setTimeout(() => {
      client.destroy();
      client.initialize();
    }, 10000);
  } else {
    console.log('❌ Too many restart attempts. Shutting down.');
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down bot...');
  client.destroy().then(() => process.exit());
});
