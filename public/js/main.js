

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const greeting = document.querySelector(".greeting-screen");

input.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
});

function typeMarkdownWithFormatting(markdown, container) {
const html = DOMPurify.sanitize(marked.parse(markdown));
const temp = document.createElement("div");
temp.innerHTML = html;

const prefix = document.createElement("strong");
prefix.textContent = "➤";
container.appendChild(prefix);
container.appendChild(document.createElement("br"));

function typeNode(node, parent, cb) {
if (node.nodeType === Node.TEXT_NODE) {
const text = node.textContent;
let i = 0;
const interval = setInterval(() => {
if (i >= text.length) {
  clearInterval(interval);
  cb();
  return;
}
parent.appendChild(document.createTextNode(text[i++]));
chatBox.scrollTop = chatBox.scrollHeight;
}, 15);
} else if (node.nodeType === Node.ELEMENT_NODE) {
const el = document.createElement(node.tagName);
for (const attr of node.attributes) {
el.setAttribute(attr.name, attr.value);
}
parent.appendChild(el);

const children = Array.from(node.childNodes);
let idx = 0;

function nextChild() {
if (idx < children.length) {
  typeNode(children[idx++], el, nextChild);
} else {
  cb();
}
}

nextChild();
} else {
cb();
}
}

const nodes = Array.from(temp.childNodes);
let idx = 0;
function nextBlock() {
if (idx < nodes.length) {
typeNode(nodes[idx++], container, nextBlock);
}
}

nextBlock();
}


form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  if (greeting) greeting.style.display = "none";

  const userDiv = document.createElement("div");
  userDiv.className = "user-message";
  userDiv.textContent = `You: ${message}`;
  chatBox.appendChild(userDiv);

  input.value = "";
  input.style.height = "auto";

  try {
    const res = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();

    const botDiv = document.createElement("div");
    botDiv.className = "bot-message";
    chatBox.appendChild(botDiv);

    typeMarkdownWithFormatting(data.reply, botDiv);
  } catch (err) {
    const errDiv = document.createElement("div");
    errDiv.className = "error-message";
    errDiv.textContent = "Error getting reply";
    chatBox.appendChild(errDiv);
    console.error(err);
  }
});