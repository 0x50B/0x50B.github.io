This blog primarily presents insights on X++ development and serves as a personal reference notebook.
Since im too lazy to write myself, most of the time I provide my notes to ChatGPT to create a blog post.

{% for tag in site.tags %}
  <h3>{{ tag[0] }}</h3>
  <ul>
    {% for post in tag[1] %}
      <li><a href="{{ post.url }}">{{ post.date | date: "%B %Y" }} - {{ post.title | safe }}</a></li>
    {% endfor %}
  </ul>
{% endfor %}
