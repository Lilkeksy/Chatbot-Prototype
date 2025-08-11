// DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const greeting = document.getElementById("greeting-screen");
const submitButton = form.querySelector('button[type="submit"]');

// Constants
const TYPING_SPEED = 15;
const MAX_INPUT_HEIGHT = 150;

// State
let isGenerating = false;
let typingInterval = null;
let conversationHistory = [];

// Utility functions
const autoResizeTextarea = () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, MAX_INPUT_HEIGHT) + "px";
};

const scrollToBottom = () => {
  // Smooth scroll to bottom; fallback to instant if unsupported
  try {
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
  } catch {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
};

const stopGeneration = () => {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
  isGenerating = false;
  submitButton.classList.remove('is-generating');
  input.disabled = false;
  input.focus();
};

const typeText = (text, parent, callback) => {
  let index = 0;
  if (typingInterval) {
    clearInterval(typingInterval);
  }
  typingInterval = setInterval(() => {
    if (!isGenerating || index >= text.length) {
      clearInterval(typingInterval);
      typingInterval = null;
      if (isGenerating) callback(); // Only call callback if not stopped
      return;
    }
    parent.appendChild(document.createTextNode(text[index++]));
    scrollToBottom();
  }, TYPING_SPEED);
};

const typeElement = (node, parent, callback) => {
    if (!isGenerating) {
        callback();
        return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        typeText(node.textContent, parent, callback);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = document.createElement(node.tagName);
        
        Array.from(node.attributes).forEach(attr => {
            element.setAttribute(attr.name, attr.value);
        });
        
        parent.appendChild(element);
        
        const children = Array.from(node.childNodes);
        let childIndex = 0;
        
        const processNextChild = () => {
            if (childIndex < children.length && isGenerating) {
                typeElement(children[childIndex++], element, processNextChild);
            } else {
                callback();
            }
        };
        
        processNextChild();
    } else {
        callback();
    }
};

const typeMarkdownWithFormatting = (markdown, container, onComplete) => {
  // Fallback to plain text if libs are unavailable
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    container.textContent = markdown;
    onComplete();
    return;
  }

  const html = DOMPurify.sanitize(marked.parse(markdown));
  const temp = document.createElement("div");
  temp.innerHTML = html;
  
  const prefix = document.createElement("strong");
  prefix.textContent = "➤";
  container.appendChild(prefix);
  container.appendChild(document.createElement("br"));
  
  const nodes = Array.from(temp.childNodes);
  let nodeIndex = 0;
  
  const processNextNode = () => {
    if (nodeIndex < nodes.length && isGenerating) {
      typeElement(nodes[nodeIndex++], container, processNextNode);
    } else {
      onComplete();
    }
  };
  
  processNextNode();
};

// Resize chat area to avoid clipping with the sticky form and fixed nav
const resizeChat = () => {
  if (!chatBox) return;
  const nav = document.querySelector('.glass-nav');
  const formEl = document.querySelector('.chat-form');
  const navH = nav ? nav.offsetHeight : 0;
  const formH = formEl ? formEl.offsetHeight : 0;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const margin = 24;
  const maxH = Math.max(200, vh - navH - formH - margin);
  chatBox.style.maxHeight = maxH + 'px';
};

const sendMessage = async (message) => {
  try {
    const response = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message,
        conversationHistory: conversationHistory.slice(-10) // Keep last 10 messages for context
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    return data.reply;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

const handleSubmit = async (e) => {
  e.preventDefault();

  if (isGenerating) {
    stopGeneration();
    return;
  }
  
  const message = input.value.trim();
  if (!message) return;
  
  if (greeting) {
    greeting.style.display = "none";
    document.body.classList.add('has-started');
  }
  
  const userMessageDiv = document.createElement('div');
  userMessageDiv.className = 'user-message message';
  const userMessageContent = document.createElement('div');
  userMessageContent.className = 'message-content';
  userMessageContent.textContent = message;
  userMessageDiv.appendChild(userMessageContent);
  chatBox.appendChild(userMessageDiv);
  
  // Add user message to conversation history
  conversationHistory.push({ role: 'user', content: message });
  
  input.value = "";
  autoResizeTextarea();
  
  const botMessageDiv = document.createElement('div');
  botMessageDiv.className = 'bot-message message';
  const botMessageContent = document.createElement('div');
  botMessageContent.className = 'message-content';
  botMessageDiv.appendChild(botMessageContent);
  chatBox.appendChild(botMessageDiv);
  scrollToBottom();

  isGenerating = true;
  submitButton.classList.add('is-generating');
  input.disabled = true;
  
  try {
    const reply = await sendMessage(message);
    
    // Add bot reply to conversation history
    conversationHistory.push({ role: 'assistant', content: reply });
    
    typeMarkdownWithFormatting(reply, botMessageContent, () => {
        stopGeneration();
        scrollToBottom();
    });
  } catch (error) {
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = 'Error getting reply';
    chatBox.appendChild(errorMessage);
    console.error("Chat error:", error);
    stopGeneration();
  }
};

// Event listeners
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isGenerating) {
        form.requestSubmit();
    }
  }
});

input.addEventListener("input", autoResizeTextarea);

form.addEventListener("submit", handleSubmit);

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById('toggle-bg');
  const canvas = document.getElementById('myCanvas');
  if (toggleBtn && canvas) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = canvas.style.display === 'none';
      canvas.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = `Background: ${isHidden ? 'On' : 'Off'}`;
    });
  }

  if(input) {
    input.focus();
  }
  // Trigger a layout to ensure the chat container can scroll
  setTimeout(() => {
    resizeChat();
    scrollToBottom();
  }, 0);
});

window.addEventListener('resize', resizeChat);