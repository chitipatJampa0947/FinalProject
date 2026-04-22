import requests
from bs4 import BeautifulSoup
import csv
import time
import os
import re

# Configuration
KEYWORDS = ["Generative AI", "LLM", "Prompt Engineering", "โมเดลภาษา", "ปัญญาประดิษฐ์", "ปัญญาอัจฉริยะ", "การเรียนรู้ของเครื่อง", "การเรียนรู้เชิงลึก", "ปัญญาประดิษฐ์ทั่วไป", "ปัญญาประดิษฐ์เฉพาะทาง", "เขียนโปรแกรม", "Framework", "Database", "API", "Web Development", "Mobile Development", "Software Engineering", "DevOps", "Cloud Computing", "Cybersecurity", "Data Science", "Machine Learning", "Artificial Intelligence", "Natural Language Processing", "Computer Vision", "Big Data", "Internet of Things", "Blockchain", "Cryptocurrency", "Smart Contracts", "Augmented Reality", "Virtual Reality", "Game Development", "UI/UX Design", "Agile Methodology", "Scrum", "Kanban"]
SEARCH_URL = "https://pantip.com/search"
BASE_URL = "https://pantip.com"
OUTPUT_FILE = "pantip_dataset.csv"
TOTAL_POST_LIMIT = 1000
PAGES_PER_KEYWORD = 50
DELAY_SECONDS = 1.5

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
}

def clean_text(text):
    """
    Cleans the text by removing HTML tags but keeping Thai and English words.
    As per DESIGN.md, we should maintain Thai stop words and English text.
    """
    if not text:
        return ""
    # Remove multiple whitespaces/newlines
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_topic_id(url):
    """
    Extracts the topic ID from a Pantip URL.
    Example: https://pantip.com/topic/41234567 -> 41234567
    """
    match = re.search(r'/topic/(\d+)', url)
    return match.group(1) if match else None

def get_post_links(keyword, page_number):
    """
    Fetches post links from Pantip search result page.
    """
    links = []
    params = {
        'q': keyword,
        'page': page_number
    }
    
    try:
        # Note: Pantip search might require some delay between page requests as well
        time.sleep(DELAY_SECONDS)
        response = requests.get(SEARCH_URL, params=params, headers=HEADERS, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Search results links often follow this pattern
        # We look for all links containing /topic/
        post_elements = soup.find_all('a', href=re.compile(r'/topic/\d+'))
        
        for elem in post_elements:
            link = elem.get('href')
            if link:
                full_link = link if link.startswith('http') else BASE_URL + link
                if full_link not in links:
                    links.append(full_link)
                
    except Exception as e:
        print(f"Error fetching search results for {keyword} (Page {page_number}): {e}")
        
    return links

def scrape_post_content(post_url):
    """
    Scrapes the title and body content of a single Pantip post.
    """
    try:
        time.sleep(DELAY_SECONDS) # Respectful delay
        response = requests.get(post_url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Selectors for Pantip posts
        title_elem = soup.find('h2', class_='display-post-title')
        body_elem = soup.find('div', class_='display-post-story')
        
        title = title_elem.get_text() if title_elem else ""
        body = body_elem.get_text() if body_elem else ""
        
        # Combine title and body for the dataset
        combined_text = f"{title}\n{body}"
        return clean_text(combined_text)
        
    except Exception as e:
        print(f"Error scraping post {post_url}: {e}")
        return None

def main():
    all_data = []
    seen_ids = set()
    
    print(f"Starting scraper. Target: {TOTAL_POST_LIMIT} posts.")
    
    for keyword in KEYWORDS:
        if len(all_data) >= TOTAL_POST_LIMIT:
            break
            
        print(f"\nSearching for keyword: '{keyword}'")
        
        for page in range(1, PAGES_PER_KEYWORD + 1):
            if len(all_data) >= TOTAL_POST_LIMIT:
                break
                
            print(f"--- Fetching Page {page} ---")
            links = get_post_links(keyword, page)
            
            if not links:
                print(f"No more links found for keyword '{keyword}' at page {page}.")
                break
                
            for link in links:
                if len(all_data) >= TOTAL_POST_LIMIT:
                    break
                    
                topic_id = extract_topic_id(link)
                if topic_id and topic_id not in seen_ids:
                    seen_ids.add(topic_id)
                    print(f"Scraping [{len(all_data)+1}/{TOTAL_POST_LIMIT}]: {link}")
                    
                    text = scrape_post_content(link)
                    if text and len(text) > 10: # Simple check to ensure we got some content
                        all_data.append({
                            'text': text,
                            'label': 'Human'
                        })
                    else:
                        print(f"Skipping {link} (Empty or too short content)")
                else:
                    # Already seen this topic or invalid link
                    pass
    
    # Save to CSV
    if all_data:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True) if os.path.dirname(OUTPUT_FILE) else None
        keys = all_data[0].keys()
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
            dict_writer = csv.DictWriter(f, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(all_data)
        print(f"\nScraping complete!")
        print(f"Successfully saved {len(all_data)} unique posts to {OUTPUT_FILE}")
    else:
        print("\nNo data collected.")

if __name__ == "__main__":
    main()
