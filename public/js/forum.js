
document.addEventListener('DOMContentLoaded', () => {
  const topicList = document.getElementById('topic-list');
  const createTopicForm = document.getElementById('create-topic-form');
  const postsSection = document.getElementById('posts');
  const postTopicTitle = document.getElementById('post-topic-title');
  const postList = document.getElementById('post-list');
  const createPostForm = document.getElementById('create-post-form');
  
  let currentTopicId = null;

  // Fetch and display topics
  async function getTopics() {
    try {
      const response = await fetch('/api/forum/topics');
      const topics = await response.json();
      topicList.innerHTML = '';
      
      if (topics.length === 0) {
        topicList.innerHTML = '<li class="empty">No topics yet. Be the first! 💬</li>';
        return;
      }
      
      topics.forEach(topic => {
        const li = document.createElement('li');
        li.className = 'topic-item';
        li.innerHTML = `
          <a href="#" class="topic-link" data-topic-id="${topic.id}">
            <strong>${topic.title}</strong>
            <span class="meta">by ${topic.author_name || 'Anonymous'} • ${topic.reply_count || 0} replies</span>
          </a>
        `;
        li.querySelector('a').addEventListener('click', (e) => {
          e.preventDefault();
          showTopic(topic.id, topic.title);
        });
        topicList.appendChild(li);
      });
    } catch (error) {
      console.error('Error loading topics:', error);
      topicList.innerHTML = '<li class="error">Failed to load topics 😢</li>';
    }
  }

  // Show a specific topic with replies
  async function showTopic(topicId, title) {
    currentTopicId = topicId;
    postTopicTitle.textContent = title;
    postsSection.style.display = 'block';
    
    try {
      const response = await fetch(`/api/forum/topics/${topicId}`);
      const data = await response.json();
      
      postList.innerHTML = `
        <li class="original-post">
          <p>${data.topic.content}</p>
          <span class="meta">Posted by ${data.topic.author_name || 'Anonymous'}</span>
        </li>
      `;
      
      data.replies.forEach(reply => {
        const li = document.createElement('li');
        li.className = 'reply';
        li.innerHTML = `
          <p>${reply.content}</p>
          <span class="meta">by ${reply.author_name || 'Anonymous'}</span>
        `;
        postList.appendChild(li);
      });
      
      postsSection.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Error loading topic:', error);
    }
  }

  // Create new topic
  createTopicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('topic-title').value;
    const content = document.getElementById('topic-content').value;
    const author = document.getElementById('author-name')?.value || 'Anonymous';
    
    try {
      const response = await fetch('/api/forum/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, author_name: author }),
      });
      
      if (response.ok) {
        createTopicForm.reset();
        getTopics();
      } else {
        alert('Failed to create topic 😢');
      }
    } catch (error) {
      console.error('Error creating topic:', error);
      alert('Failed to create topic 😢');
    }
  });

  // Create reply
  createPostForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentTopicId) return;
    
    const content = document.getElementById('post-content').value;
    const author = 'Anonymous'; // Could add author field
    
    try {
      const response = await fetch(`/api/forum/topics/${currentTopicId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, author_name: author }),
      });
      
      if (response.ok) {
        document.getElementById('post-content').value = '';
        showTopic(currentTopicId, postTopicTitle.textContent);
      }
    } catch (error) {
      console.error('Error creating reply:', error);
    }
  });

  getTopics();
});
