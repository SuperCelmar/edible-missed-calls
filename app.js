const { Client, GatewayIntentBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const openai = require('openai');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

const assistants = [
    {
        id: '39ad121b-0f23-4966-80f5-69d2f162c7d7',
        name: 'Edible Torrance',
        description: 'Order Assistant for Edible Torrance'
    },
    {
        id: '4bc0969e-9739-4578-b6a7-dc2593df8880',
        name: 'Edible San Diego',
        description: 'Order Assistant for Edible San Diego'
    },
    {
        id: '1bba6052-1141-4be5-b660-f02734e981c1',
        name: 'Edible Callback Torrance',
        description: 'Callback Assistant for Edible Torrance. Sends link to order online.'
    },
    {
        id: '05886d9b-5455-4b46-80cf-b9d553e30f9e',
        name: 'Edible Callback San Diego',
        description: 'Callback Assistant for Edible San Diego. Sends link to order online.'
    }
];

let selectedTime = null;
let selectedAssistant = null;

client.on('interactionCreate', async interaction => {
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'starttime') {
            selectedTime = interaction.values[0];
            await interaction.reply({ content: `Selected time: ${selectedTime}`, ephemeral: true });
        }
        if (interaction.customId === 'assistant') {
            selectedAssistant = interaction.values[0];
            await interaction.reply({ content: `Selected assistant: ${selectedAssistant}`, ephemeral: true });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'schedule') {
            if (selectedTime) {
                await interaction.reply({ content: `Scheduled call at ${selectedTime}`, ephemeral: true });
                // Queue the VAPI call
                queueVapiCall(selectedTime, selectedAssistant);
            } else  if (!selectedTime && !selectedAssistant) {
                await interaction.reply({ content: 'Please select a time before scheduling. And then select an assistant that will process the call.', ephemeral: true });
            } else if (!selectedTime && selectedAssistant) {
                await interaction.reply({ content: 'Please select a time before scheduling.', ephemeral: true });
            } else if (selectedTime && !selectedAssistant) {
                await interaction.reply({ content: 'Please select an assistant that will process the call.', ephemeral: true });
            }
        }
    }

});

async function queueVapiCall(time, assistantId) {
    // Implement the logic to queue the VAPI call at the specified time
    console.log(`Queueing VAPI call at ${time}`);
    // Example: Use setTimeout to simulate scheduling
    const now = new Date();
    const [hour, minutePeriod] = time.split(':');
    const [minute, period] = minutePeriod.split(/(am|pm)/);
    let hour24 = parseInt(hour, 10);
    if (period === 'pm' && hour24 !== 12) hour24 += 12;
    if (period === 'am' && hour24 === 12) hour24 = 0;
    const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour24, parseInt(minute, 10), 0, 0);
    const delay = targetTime - now;
    const queuedData = await getPhoneNumbersFromSupabase('received');
    let phoneNumbers = [];
    let callerNames = [];
    for (const phoneData of queuedData) {
        phoneNumbers.push(phoneData.phone_e164);
        callerNames.push('Unknown');
        updatePhoneStatus(phoneData.phone, 'queued', selectedTime);
    }

    if (delay > 0) {
        setTimeout(() => {
            triggerVapiCall(phoneNumbers,callerNames,assistantId); // Call your VAPI function here
        }, delay);
        await updatePhoneStatus(phoneData.phone, 'called', selectedTime);
    } else {
        console.log('Selected time is in the past. Please select a future time.');
    }
}

async function triggerVapiCall(phoneNumbers, callerNames, assistantId) {
    const url = 'https://api.vapi.ai/call';
    const headers = {
        'Authorization': 'Bearer ' + process.env.VAPI_API_KEY,
        'Content-Type': 'application/json'
    };
    for (let i = 0; i < phoneNumbers.length; i++) {
        const data = {
            "name": callerNames[i],
            "assistantId": assistantId,
            "phoneNumberId": "69837fc3-9e5a-4e74-b4f3-c48df4334c1b",
            "customer": {
                "number": phoneNumbers[i],
        }
        };
        const response = await axios.post(url, data, { headers });
        console.log(response.data);
    }
};

function generateTimeOptions() {
    const options = [];
    const currentTime = new Date();
    const losAngelesTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        hour12: false
    }).format(currentTime);
    const currentHour = parseInt(losAngelesTime, 10);
    const startHour = 9;
    const endHour = 20; // 8 PM in 24-hour format

    let isTomorrow = false;

    if (currentHour >= endHour) {
        isTomorrow = true;
    }

    for (let hour = startHour; hour <= endHour; hour++) {
        if (hour > currentHour || isTomorrow) {
            const period = hour < 12 ? 'am' : 'pm';
            const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
            const timeString = `${formattedHour}:07${period}`;
            const label = isTomorrow ? `${timeString} (Tomorrow)` : `${timeString} (Today)`;
            options.push({
                label: label,
                value: timeString
            });
        }
    }

    return options;
}

// Cost usage function
function getUsage(usageObject) {
    prompt_tokens = usageObject.prompt_tokens;
    completion_tokens = usageObject.completion_tokens;
    cached_tokens = usageObject.prompt_tokens_details.cached_tokens;
    
    // Cost per tokens
    const costInput = 0.15/1000000;
    const costOutput = 0.06/1000000;
    const costCached = 0.075/1000000;

    // Calculate the cost
    const cost = (prompt_tokens * costInput) + (completion_tokens * costOutput) + (cached_tokens * costCached);
    return cost;

}

function getCurrentDateISO() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

// Check if the phone number is already in the Supabase
async function isPhoneSupabaseReceivedAlready(phone) {
    const url = `https://zyzfexcextzzhremtkoc.supabase.co/rest/v1/callbackList?phone=eq.${phone}`;
    const headers = {
        'apikey': process.env.SUPABASE_API_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_API_KEY,
        'Content-Type': 'application/json'
    };
    const response = await axios.get(url, { headers });
    return (response.data.length > 0)
}

// Save the phone number to Supabase
async function savePhoneToSupabase(phone, date, phone_e164) {
    if (isPhoneSupabaseReceivedAlready(phone) === false) {
        const url =
            "https://zyzfexcextzzhremtkoc.supabase.co/rest/v1/callbackList";
        const headers = {
            apikey: process.env.SUPABASE_API_KEY,
            Authorization: "Bearer " + process.env.SUPABASE_API_KEY,
            "Content-Type": "application/json",
        };
        const data = {
            phone: phone,
            date: date,
            status: "received",
            lastUpdated: getCurrentDateISO(),
            phone_e164: phone_e164,
        };
        const response = await axios.post(url, data, { headers });
        console.log(response.data);
    } else {
        console.log("Phone number already exists in Supabase");
    }
}
// Change status from received to queued, or to called, or to failed
async function updatePhoneStatus(phone, status, selectedTime) {
    const url = `https://zyzfexcextzzhremtkoc.supabase.co/rest/v1/callbackList?phone=eq.${phone}`;
    const headers= {
        'apikey': process.env.SUPABASE_API_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_API_KEY,
        'Content-Type': 'application/json'
    };
    const data = {
        "status": status,
        "schedule_time": selectedTime,
    };
    const response = await axios.patch(url, data, { headers });
    console.log(response.data);
}

// Get the list of phone numbers that are in the queue from Supabase
async function getPhoneNumbersFromSupabase(status) {
    const url = `https://zyzfexcextzzhremtkoc.supabase.co/rest/v1/callbackList?status=eq.${status}`;
    const headers = {
        'apikey': process.env.SUPABASE_API_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_API_KEY,
        'Content-Type': 'application/json'
    };
    const response = await axios.get(url, { headers });
    return response.data;
}


// Prompt
const prompt_text = `List down all the phone numbers on this picture, \nAlong with the date and time the user call.\nReturn your answer in a JSON format:
{
  "missed-calls": [
    {
      "phone": "+1 888-333-4444",
      "phone_e164": "+18883334444",
      "date": "2/10/2025",
      "time": "5:00 PM"
    },
   {
      "phone": "+1 888-333-5555",
      "phone_e164": "+18883335555",
      "date": "2/10/2025",
      "time": "5:30 PM"
    }
  ]
}

only return the JSON object, do not add any format, or backticks
- Do not second guess the phone number, if you are not sure about the phone number don't add it to the list.
- If the date and time are not clear, you can skip it.
- Give only a unique phone number, do not repeat the same phone number as perhaps the same person called multiple times.`;

// If there's an image attached to the message, we'll send it to the OpenAI API to get a description of the image.
client.on('messageCreate', async message => {
    if (message.attachments.size > 0) {
        try {
            const attachment = message.attachments.first();
            const image = await axios.get(attachment.url, {
                responseType: 'arraybuffer'
            });

            console.log(attachment.url);
            const openaiClient = new openai.OpenAI(process.env.OPENAI_API_KEY);
            const response = await openaiClient.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                'type': 'text', text: prompt_text
                            },
                            {
                                'type': 'image_url', image_url: { url: attachment.url }
                            }
                        ]
                    },
                ],
                temperature: 0.2,
            });

            const replyContent = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
            if (replyContent) {
                
                // Parse the response
                const parsedResponse = JSON.parse(response.choices[0].message.content);
                console.log(parsedResponse);
                let reply = '';
                phoneNumbers = [];
                callerNames = [];
                for (const call of parsedResponse['missed-calls']) {
                    const alreadySent = await isPhoneSupabaseReceivedAlready(call.phone);
                    if (!alreadySent) {
                        reply = reply + (`**Phone:** ${call.phone}, **Date:** ${call.date}, **Time:** ${call.time} \n`);
                        phoneNumbers.push(call.phone_e164);
                        callerNames.push('Unknown');
                        savePhoneToSupabase(call.phone, call.date, call.phone_e164);
                    }
                }
                const queuedData = await getPhoneNumbersFromSupabase('received');
                
                let queuedMsg = `There are ${queuedData.length} phone numbers in the ready to be called.\n`;
                for (const phoneData of queuedData) {
                    queuedMsg += `${phoneData.phone} - called: ${phoneData.date}\n`;
                }
                const confirm = new ButtonBuilder()
                    .setCustomId('schedule')
                    .setLabel('Schedule Now')
                    .setStyle(ButtonStyle.Primary);

                const timeOptions = generateTimeOptions();
                console.log(timeOptions);
                const select = new StringSelectMenuBuilder()
                    .setCustomId('starttime')
                    .setPlaceholder('Choose the start time')
                    .addOptions(timeOptions.map(option => new StringSelectMenuOptionBuilder().setLabel(option.label).setValue(option.value)));

                const assistant = new StringSelectMenuBuilder()
                    .setCustomId('assistant')
                    .setPlaceholder('Choose the assistant')
                    .addOptions(assistants.map(option => new StringSelectMenuOptionBuilder().setLabel(option.name).setDescription(option.description).setValue(option.id)));

                const row1 = new ActionRowBuilder().addComponents(confirm);
                const row2 = new ActionRowBuilder().addComponents(select);
                const row3 = new ActionRowBuilder().addComponents(assistant);
                await message.reply({ content: queuedMsg + "### Select a time to start calling the leads back.", components: [row1, row2, row3] });
                
            } else {
                await message.reply('Sorry, I could not generate a description for the image.');
            }
        } catch (error) {
            console.error('Error processing image:', error);
            await message.reply('There was an error processing the image.');
        }
    }

    // else if (message.attachments.size === 0 && message.content.startsWith('+')) {
    //     try {
    //         const lines = message.content.split('\n');
    //         const phoneNumbers = [];
    //         const callerNames = [];

    //         for (let i = 0; i < lines.length; i += 2) {
    //             const phone = lines[i];
    //             const name = lines[i + 1];
    //             phoneNumbers.push(phone);
    //             callerNames.push(name);
    //             savePhoneToSupabase(phone, getCurrentDateISO());
    //         }
            
    //         const queuedData = getPhoneNumbersFromSupabase();
    //         const queuedMsg = `There are ${queuedData.length} phone numbers in the queue.\n`;
    //         for (const phoneData of queuedData) {
    //             queuedMsg += `${phoneData.phone} - called: ${phoneData.date}\n`;
    //         }
    //         const confirm = new ButtonBuilder()
    //             .setCustomId('schedule')
    //             .setLabel('Schedule Now')
    //             .setStyle(ButtonStyle.PRIMARY);

    //         const timeOptions = generateTimeOptions();

    //         const select = new StringSelectMenuBuilder()
    //             .setCustomId('starttime')
    //             .setPlaceholder('Choose the start time')
    //             .addOptions(timeOptions.map(option => new StringSelectMenuOptionBuilder().setLabel(option.label).setValue(option.value)));


    //         const row = new ActionRowBuilder()
    //             .addComponents(confirm, select);
    //         await message.reply({ content: queuedMsg + "### Select a time to start calling the leads back.", components: [row] });
    //     } catch (error) {
    //         console.error('Error processing text:', error);
    //         await message.reply('There was an error processing your text.');
    //     }
    // }
});

console.log(process.env.DISCORD_TOKEN);

client.login(process.env.DISCORD_TOKEN);