
// DOM Elements
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const greeting = document.getElementById("greeting-screen");

// Constants
const TYPING_SPEED = 15;
const MAX_INPUT_HEIGHT = 150;

// Utility functions
const autoResizeTextarea = () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, MAX_INPUT_HEIGHT) + "px";
};

const scrollToBottom = () => {
  chatBox.scrollTop = chatBox.scrollHeight;
};

const createMessageElement = (className, content) => {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = content;
  return element;
};

const typeText = (text, parent, callback) => {
  let index = 0;
  const interval = setInterval(() => {
    if (index >= text.length) {
      clearInterval(interval);
      callback();
      return;
    }
    parent.appendChild(document.createTextNode(text[index++]));
    scrollToBottom();
  }, TYPING_SPEED);
};

const typeElement = (node, parent, callback) => {
  if (node.nodeType === Node.TEXT_NODE) {
    typeText(node.textContent, parent, callback);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const element = document.createElement(node.tagName);
    
    // Copy attributes
    Array.from(node.attributes).forEach(attr => {
      element.setAttribute(attr.name, attr.value);
    });
    
    parent.appendChild(element);
    
    const children = Array.from(node.childNodes);
    let childIndex = 0;
    
    const processNextChild = () => {
      if (childIndex < children.length) {
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

const typeMarkdownWithFormatting = (markdown, container) => {
  // Sanitize and parse markdown
  const html = DOMPurify.sanitize(marked.parse(markdown));
  const temp = document.createElement("div");
  temp.innerHTML = html;
  
  // Add prefix
  const prefix = document.createElement("strong");
  prefix.textContent = "➤";
  container.appendChild(prefix);
  container.appendChild(document.createElement("br"));
  
  // Type each node
  const nodes = Array.from(temp.childNodes);
  let nodeIndex = 0;
  
  const processNextNode = () => {
    if (nodeIndex < nodes.length) {
      typeElement(nodes[nodeIndex++], container, processNextNode);
    }
  };
  
  processNextNode();
};

const sendMessage = async (message) => {
  try {
    const response = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
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
  
  const message = input.value.trim();
  if (!message) return;
  
  // Hide greeting screen
  if (greeting) {
    greeting.style.display = "none";
  }
  
  // Add user message
  const userMessage = createMessageElement("user-message", `You: ${message}`);
  chatBox.appendChild(userMessage);
  
  // Clear input and reset height
  input.value = "";
  autoResizeTextarea();
  
  // Add bot message container
  const botMessage = createMessageElement("bot-message", "");
  chatBox.appendChild(botMessage);
  
  try {
    const reply = await sendMessage(message);
    typeMarkdownWithFormatting(reply, botMessage);
  } catch (error) {
    const errorMessage = createMessageElement("error-message", "Error getting reply");
    chatBox.appendChild(errorMessage);
    console.error("Chat error:", error);
  }
};

// Event listeners
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", autoResizeTextarea);

form.addEventListener("submit", handleSubmit);

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Focus input on load
  input.focus();
  
  // Ensure proper scroll behavior
  scrollToBottom();
});