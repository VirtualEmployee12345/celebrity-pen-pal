// Celebrity Penpal App
let currentCelebrity = null;
let selectedHandwriting = 'casual';

// Load celebrities on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCelebrities();
    loadForumTopics();
    setupCategoryFilters();
    setupHandwritingSelection();
    setupMobileNav();
});

// Load celebrities from API
async function loadCelebrities(category = 'all', search = '') {
    const grid = document.getElementById('celebrityGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading">Loading stars... ✨</div>';
    
    try {
        const params = new URLSearchParams();
        if (category !== 'all') params.append('category', category);
        if (search) params.append('search', search);
        
        const response = await fetch(`/api/celebrities?${params}`);
        
        // Check if response is OK
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', response.status, errorText);
            throw new Error(`Server error: ${response.status}`);
        }
        
        // Check content type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Unexpected response:', text.substring(0, 200));
            throw new Error('Server returned non-JSON response');
        }
        
        const celebrities = await response.json();
        
        if (!Array.isArray(celebrities)) {
            console.error('Invalid response format:', celebrities);
            throw new Error('Invalid response format');
        }
        
        if (celebrities.length === 0) {
            grid.innerHTML = '<div class="loading">No stars found... database may be seeding. Try refreshing in 10 seconds! 🔍</div>';
            return;
        }
        
        grid.innerHTML = celebrities.map(celeb => {
            // Escape quotes in names to prevent JS errors
            const safeName = celeb.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeCategory = (celeb.category || 'Celebrity').replace(/'/g, "\\'");
            const safeImage = (celeb.image_url || '').replace(/'/g, "\\'");
            
            return `
            <div class="celebrity-card" onclick="openLetterModal(${celeb.id}, '${safeName}', '${safeCategory}', '${safeImage}')">
                <img src="${celeb.image_url || 'https://via.placeholder.com/120?text=⭐'}" alt="${celeb.name}" class="celebrity-avatar" onerror="this.src='https://via.placeholder.com/120?text=⭐'">
                <div class="celebrity-name">${celeb.name}</div>
                <span class="celebrity-category-tag">${celeb.category || 'Celebrity'}</span>
                <button class="write-btn">Write Letter ✉️</button>
            </div>
        `}).join('');
        
    } catch (error) {
        console.error('Error loading celebrities:', error);
        grid.innerHTML = `
            <div class="loading" style="text-align: center; padding: 2rem;">
                <p>Oops! Something went wrong... 🥺</p>
                <p style="font-size: 0.9rem; color: #888; margin-top: 1rem;">
                    Error: ${error.message}<br>
                    <button onclick="loadCelebrities()" class="btn btn-primary" style="margin-top: 1rem;">Try Again</button>
                </p>
            </div>
        `;
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
    const searchInput = document.getElementById('heroSearch');
    if (!searchInput) return;
    
    const search = searchInput.value;
    document.getElementById('browse').scrollIntoView({ behavior: 'smooth' });
    loadCelebrities('all', search);
}

// Enter key on search - use optional chaining safely
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('heroSearch');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchCelebrities();
        });
    }
});

// Open letter modal
function openLetterModal(id, name, category, imageUrl) {
    currentCelebrity = { id, name, category, imageUrl };
    
    const modalName = document.getElementById('modalName');
    const modalCategory = document.getElementById('modalCategory');
    const modalAvatar = document.getElementById('modalAvatar');
    const letterModal = document.getElementById('letterModal');
    
    if (modalName) modalName.textContent = name;
    if (modalCategory) modalCategory.textContent = category || 'Celebrity';
    if (modalAvatar) {
        modalAvatar.src = imageUrl || 'https://via.placeholder.com/80?text=⭐';
        modalAvatar.alt = name;
    }
    if (letterModal) {
        letterModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Close modal
function closeModal() {
    const letterModal = document.getElementById('letterModal');
    if (letterModal) {
        letterModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    currentCelebrity = null;
}

// Close modal on outside click
document.addEventListener('DOMContentLoaded', () => {
    const letterModal = document.getElementById('letterModal');
    if (letterModal) {
        letterModal.addEventListener('click', (e) => {
            if (e.target.id === 'letterModal') closeModal();
        });
    }
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
            if (!textarea) return;
            
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

// Mobile nav toggle
function setupMobileNav() {
    const navToggle = document.getElementById('navToggle');
    const mainNav = document.getElementById('mainNav');

    if (!navToggle || !mainNav) return;

    navToggle.addEventListener('click', () => {
        const isOpen = mainNav.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    mainNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mainNav.classList.remove('is-open');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

// Submit letter
async function submitLetter() {
    if (!currentCelebrity) return;
    
    const message = document.getElementById('letterMessage')?.value.trim();
    const email = document.getElementById('customerEmail')?.value.trim();
    
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
            const letterMessage = document.getElementById('letterMessage');
            const customerEmail = document.getElementById('customerEmail');
            if (letterMessage) letterMessage.value = '';
            if (customerEmail) customerEmail.value = '';
        } else {
            alert('Oops! Something went wrong... please try again! 🥺');
        }
    } catch (error) {
        console.error('Error submitting letter:', error);
        alert('Oops! Something went wrong... please try again! 🥺');
    }
}

// Handle sample letter image upload
document.addEventListener('DOMContentLoaded', () => {
    const sampleUpload = document.getElementById('sampleUpload');
    if (sampleUpload) {
        sampleUpload.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const sampleLetterImg = document.getElementById('sampleLetterImg');
                    const sampleCaption = document.querySelector('.sample-caption');
                    if (sampleLetterImg) sampleLetterImg.src = event.target.result;
                    if (sampleCaption) sampleCaption.textContent = 'Your uploaded sample letter';
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// Load forum topics
async function loadForumTopics() {
    const container = document.getElementById('forumTopics');
    if (!container) return;
    
    try {
        const response = await fetch('/api/forum/topics');
        
        if (!response.ok) {
            console.error('Forum API error:', response.status);
            return;
        }
        
        const topics = await response.json();
        
        if (!Array.isArray(topics) || topics.length === 0) {
            container.innerHTML = '<div class="loading">No discussions yet... be the first! 💭</div>';
            return;
        }
        
        container.innerHTML = topics.slice(0, 3).map(topic => `
            <div class="topic-item">
                <div>
                    <div class="topic-title">${topic.title}</div>
                    <div class="topic-meta">by ${topic.author_name || 'Anonymous'} • ${topic.celebrity_name || 'General'} • ${topic.reply_count || 0} replies</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading forum:', error);
    }
}

// Smooth scroll for nav links
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
