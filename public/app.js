// Starletters App
let currentCelebrity = null;
let selectedHandwriting = 'casual';

// Load celebrities on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCelebrities();
    loadForumTopics();
    setupCategoryFilters();
    setupHandwritingSelection();
});

// Load celebrities from API
async function loadCelebrities(category = 'all', search = '') {
    const grid = document.getElementById('celebrityGrid');
    grid.innerHTML = '<div class="loading">Loading stars... ✨</div>';
    
    try {
        const params = new URLSearchParams();
        if (category !== 'all') params.append('category', category);
        if (search) params.append('search', search);
        
        const response = await fetch(`/api/celebrities?${params}`);
        const celebrities = await response.json();
        
        if (celebrities.length === 0) {
            grid.innerHTML = '<div class="loading">No stars found... try another search? 🔍</div>';
            return;
        }
        
        grid.innerHTML = celebrities.map(celeb => `
            <div class="celebrity-card" onclick="openLetterModal(${celeb.id}, '${celeb.name}', '${celeb.category}', '${celeb.image_url || ''}')">
                <img src="${celeb.image_url || 'https://via.placeholder.com/120?text=⭐'}" alt="${celeb.name}" class="celebrity-avatar">
                <div class="celebrity-name">${celeb.name}</div>
                <span class="celebrity-category-tag">${celeb.category || 'Celebrity'}</span>
                <button class="write-btn">Write Letter ✉️</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading celebrities:', error);
        grid.innerHTML = '<div class="loading">Oops! Something went wrong... 🥺</div>';
    }
}

// Setup category filters
function setupCategoryFilters() {
    const buttons = document.querySelectorAll('.category-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadCelebrities(btn.dataset.category);
        });
    });
}

// Search from hero
function searchCelebrities() {
    const search = document.getElementById('heroSearch').value;
    document.getElementById('browse').scrollIntoView({ behavior: 'smooth' });
    loadCelebrities('all', search);
}

// Enter key on search
 document.getElementById('heroSearch')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchCelebrities();
});

// Open letter modal
function openLetterModal(id, name, category, imageUrl) {
    currentCelebrity = { id, name, category, imageUrl };
    
    document.getElementById('modalName').textContent = name;
    document.getElementById('modalCategory').textContent = category || 'Celebrity';
    document.getElementById('modalAvatar').src = imageUrl || 'https://via.placeholder.com/80?text=⭐';
    document.getElementById('modalAvatar').alt = name;
    
    document.getElementById('letterModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    document.getElementById('letterModal').classList.remove('active');
    document.body.style.overflow = '';
    currentCelebrity = null;
}

// Close modal on outside click
document.getElementById('letterModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'letterModal') closeModal();
});

// Handwriting style selection
function setupHandwritingSelection() {
    const buttons = document.querySelectorAll('.handwriting-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedHandwriting = btn.dataset.style;
            
            // Update textarea font
            const textarea = document.getElementById('letterMessage');
            if (selectedHandwriting === 'elegant') {
                textarea.style.fontFamily = "'Times New Roman', serif";
                textarea.style.fontStyle = 'italic';
            } else if (selectedHandwriting === 'playful') {
                textarea.style.fontFamily = "'Comic Sans MS', cursive";
                textarea.style.fontStyle = 'normal';
            } else {
                textarea.style.fontFamily = "'Caveat', cursive";
                textarea.style.fontStyle = 'normal';
            }
        });
    });
}

// Submit letter
async function submitLetter() {
    if (!currentCelebrity) return;
    
    const message = document.getElementById('letterMessage').value.trim();
    const email = document.getElementById('customerEmail').value.trim();
    
    if (!message) {
        alert('Please write a message! 💌');
        return;
    }
    
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email! 📧');
        return;
    }
    
    try {
        const response = await fetch('/api/letters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                celebrity_id: currentCelebrity.id,
                customer_email: email,
                message: message,
                handwriting_style: selectedHandwriting
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Letter submitted! 🎉 We\'ll get that handwritten and sent for you!');
            closeModal();
            document.getElementById('letterMessage').value = '';
            document.getElementById('customerEmail').value = '';
        } else {
            alert('Oops! Something went wrong... please try again! 🥺');
        }
    } catch (error) {
        console.error('Error submitting letter:', error);
        alert('Oops! Something went wrong... please try again! 🥺');
    }
}

// Handle sample letter image upload
document.getElementById('sampleUpload')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('sampleLetterImg').src = event.target.result;
            document.querySelector('.sample-caption').textContent = 'Your uploaded sample letter';
        };
        reader.readAsDataURL(file);
    }
});

// Load forum topics
async function loadForumTopics() {
    const container = document.getElementById('forumTopics');
    
    try {
        const response = await fetch('/api/forum/topics');
        const topics = await response.json();
        
        if (topics.length === 0) {
            container.innerHTML = '<div class="loading">No discussions yet... be the first! 💭</div>';
            return;
        }
        
        container.innerHTML = topics.slice(0, 3).map(topic => `
            <div class="topic-item">
                <div>
                    <div class="topic-title">${topic.title}</div>
                    <div class="topic-meta">by ${topic.author_name} • ${topic.celebrity_name || 'General'} • ${topic.reply_count} replies</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading forum:', error);
    }
}

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});
