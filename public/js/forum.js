
document.addEventListener('DOMContentLoaded', () => {
  const topicList = document.getElementById('topic-list');
  const createTopicForm = document.getElementById('create-topic-form');

  // Fetch and display topics
  async function getTopics() {
    const response = await fetch('/api/topics');
    const topics = await response.json();
    topicList.innerHTML = '';
    topics.forEach(topic => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="#" data-topic-id="${topic.id}">${topic.title}</a>`;
      topicList.appendChild(li);
    });
  }

  createTopicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('topic-title').value;
    const content = document.getElementById('topic-content').value;
    await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    getTopics();
    createTopicForm.reset();
  });

  getTopics();
});
