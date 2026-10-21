const grid = document.getElementById("calendarGrid");
const monthTitle = document.getElementById("monthTitle");
const monthSubtitle = document.getElementById("monthSubtitle");
const dialog = document.getElementById("memoryDialog");
const dateTitle = document.getElementById("selectedDateTitle");
const dateSubtitle = document.getElementById("selectedDateSubtitle");
const photoGrid = document.getElementById("photoGrid");
const memoryForm = document.getElementById("memoryForm");
const photoInput = document.getElementById("photoInput");
const saveStatus = document.getElementById("saveStatus");
const captionInput = document.getElementById("memoryCaption");
const memoryList = document.getElementById("memoryList");
const memoryCount = document.getElementById("memoryCount");

photoInput.addEventListener("change", () => {
  const files = Array.from(photoInput.files || []);
  if (!files.length) {
    saveStatus.textContent = "No photo received. Please try again.";
    return;
  }
  addPhotos(files).then(() => {
    photoInput.value = "";
  });
});

let currentMonth = new Date();
currentMonth.setDate(1);

let selectedDate = null;
let memories = [];
let db = null;
let restored = false;

// IndexedDB keeps the real photos on this device.
try {
  const request = indexedDB.open("SunAndSkyDB", 1);

  request.onupgradeneeded = event => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains("memories")) {
      database.createObjectStore("memories", { keyPath: "date" });
    }
  };

  request.onsuccess = event => {
    db = event.target.result;
    loadMemories();
  };

  request.onerror = () => {
    saveStatus.textContent =
      "Storage could not be opened. Open the app from its https link in Chrome or Safari (not from a downloaded file), and turn off private mode.";
  };
} catch (error) {
  saveStatus.textContent =
    "Storage is not available here. Open the app from its https link, not from a file.";
}

function dateKey(year, month, day) {
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function prettyDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function saveMemory(memory) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("memories", "readwrite");
    transaction.objectStore("memories").put(memory);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("Storage is full or blocked."));
  });
}

function loadMemories() {
  const transaction = db.transaction("memories", "readonly");
  const request = transaction.objectStore("memories").getAll();

  request.onsuccess = () => {
    memories = request.result;
    renderCalendar();
    renderMemoryList();
    if (!restored) {
      restored = true;
      let k = null;
      try { k = sessionStorage.getItem("sunsky-date"); } catch (e) {}
      if (k) openDate(k);
    }
  };
}

function renderCalendar() {
  grid.replaceChildren();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  monthTitle.textContent = currentMonth.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  monthSubtitle.textContent = "A month full of possibilities ✨";

  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayKey = dateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const memoryDates = new Set(memories.map(memory => memory.date));

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("div");
    empty.className = "day empty";
    empty.setAttribute("aria-hidden", "true");
    grid.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const key = dateKey(year, month, day);
    const button = document.createElement("button");

    button.type = "button";
    button.className = "day";
    button.textContent = day;
    button.setAttribute("aria-label", prettyDate(key));

    if (key === todayKey) button.classList.add("today");
    if (key === selectedDate) button.classList.add("selected");

    if (memoryDates.has(key)) {
      button.classList.add("has-memory");
      button.setAttribute("aria-label", prettyDate(key) + ", has memories");
    }

    button.addEventListener("click", () => openDate(key));
    grid.appendChild(button);
  }
}

function openDate(key) {
  selectedDate = key;

  dateTitle.textContent = "Your memories ♡";
  dateSubtitle.textContent = prettyDate(key);
  saveStatus.textContent = "";

  photoGrid.replaceChildren();

  const memory = memories.find(item => item.date === key);
  captionInput.value = memory ? (memory.caption || "") : "";
  try { sessionStorage.setItem("sunsky-date", key); } catch (e) {}

  if (memory) {
    memory.photos.forEach(photo => {
      const image = document.createElement("img");
      image.src = photo.data;
      image.alt = "Memory from " + prettyDate(key);
      photoGrid.appendChild(image);
    });

    if (memory.caption) {
      const note = document.createElement("p");
      note.textContent = memory.caption;
      note.className = "dialog-subtitle";
      photoGrid.appendChild(note);
    }
  } else {
    const message = document.createElement("p");
    message.className = "dialog-subtitle";
    message.textContent =
      "A fresh little page. Add a photo to remember this day. ☀️";
    photoGrid.appendChild(message);
  }

  renderCalendar();

  if (!dialog.open) dialog.showModal();
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        // Shrink big pictures so they fit in device storage.
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve({
          name: file.name,
          data: canvas.toDataURL("image/jpeg", 0.82)
        });
      };

      image.onerror = () =>
        reject(
          new Error(
            "This photo format isn't supported (it may be HEIC). Try a JPEG or PNG."
          )
        );
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.readAsDataURL(file);
  });
}

async function addPhotos(files) {
  const say = m => { saveStatus.textContent = m; };
  try {
    if (!db) throw new Error("Storage is not ready. Open the app from its https link and refresh.");
    if (!selectedDate) throw new Error("Please tap a calendar date first.");
    const newPhotos = [];
    let failed = 0, lastError = "";
    for (let i = 0; i < files.length; i++) {
      say("Saving photo " + (i + 1) + " of " + files.length + "...");
      try { newPhotos.push(await readPhoto(files[i])); }
      catch (e) { failed++; lastError = e.message; }
    }
    if (!newPhotos.length) throw new Error(lastError || "None of the photos could be used.");
    const existing = memories.find(m => m.date === selectedDate);
    const memory = {
      date: selectedDate,
      caption: captionInput.value.trim() || (existing ? existing.caption : ""),
      photos: [...(existing ? existing.photos : []), ...newPhotos]
    };
    await saveMemory(memory);
    const i = memories.findIndex(m => m.date === selectedDate);
    if (i >= 0) memories[i] = memory; else memories.push(memory);
    renderMemoryList();
    openDate(selectedDate);
    say(failed ? "Saved " + newPhotos.length + " photo(s). " + failed + " could not be used. 💛" : "Memory saved! ☀️💛");
  } catch (e) {
    say("Couldn't save: " + (e.message || "Please try again."));
  }
}

// The note button saves only the caption.
memoryForm.addEventListener("submit", async event => {
  event.preventDefault();
  const existing = memories.find(m => m.date === selectedDate);
  if (!existing) {
    saveStatus.textContent = "Add a photo first, then your note can be saved. 💛";
    return;
  }
  existing.caption = captionInput.value.trim();
  try {
    await saveMemory(existing);
    renderMemoryList();
    openDate(selectedDate);
    saveStatus.textContent = "Note saved 💛";
  } catch (e) {
    saveStatus.textContent = "Couldn't save the note.";
  }
});

document.getElementById("prevMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
});

function renderMemoryList() {
  memoryList.replaceChildren();

  const photoTotal = memories.reduce(
    (sum, memory) => sum + memory.photos.length,
    0
  );

  memoryCount.textContent = photoTotal + (photoTotal === 1 ? " photo" : " photos");

  const sorted = [...memories].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const sun = document.createElement("div");
    sun.className = "sun";
    sun.textContent = "☀️";

    const heading = document.createElement("h3");
    heading.textContent = "Your story starts here";

    const paragraph = document.createElement("p");
    paragraph.textContent =
      "Tap any date on your calendar and add your very first memory.";

    empty.append(sun, heading, paragraph);
    memoryList.appendChild(empty);
    return;
  }

  sorted.forEach(memory => {
    const card = document.createElement("article");
    card.className = "memory-card";

    const image = document.createElement("img");
    image.src = memory.photos[0].data;
    image.alt = "Memory from " + prettyDate(memory.date);
    image.loading = "lazy";

    const heading = document.createElement("h3");
    heading.textContent = prettyDate(memory.date);

    const description = document.createElement("p");
    description.textContent =
      (memory.caption ? memory.caption + " · " : "") +
      memory.photos.length +
      " photo(s)";

    card.append(image, heading, description);
    card.addEventListener("click", () => openDate(memory.date));
    card.style.cursor = "pointer";

    memoryList.appendChild(card);
  });
}

document.getElementById("profileBtn").addEventListener("click", () => {
  alert(
    "Welcome to Sun & Sky! ☀️\n\n" +
      "Google accounts and invitations are coming in a later version."
  );
});

renderCalendar();

dialog.addEventListener("close", () => {
  try { sessionStorage.removeItem("sunsky-date"); } catch (e) {}
});
