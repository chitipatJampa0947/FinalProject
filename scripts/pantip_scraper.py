import requests
from bs4 import BeautifulSoup
import csv
import time
import os
import re
import sys

# Configuration
KEYWORDS = ['AI', 'Work from home', 'Hybrid working', 'Meeting', 'Deadline', 'Feedback', 'Soft skills', 'Hard skills', 'Upskill', 'Reskill', 'Growth mindset', 'Experience', 'Solution', 'Connection', 'Networking', 'Startup', 'Innovation', 'Leadership', 'Teamwork', 'Communication', 'Productivity', 'Work-life balance', 'Remote work', 'Career development', 'Job search', 'Interview tips', 'Salary negotiation', 'Personal branding', 'Time management', 'Stress management', 'Mental health at work', 'Diversity and inclusion', 'Employee engagement', 'Company culture', 'Performance review', 'Professional development', 'Mentorship', 'Workplace conflict', 'Collaboration', 'Creativity', 'Problem-solving', 'Decision-making', 'Emotional intelligence', 'Adaptability', 'Resilience', 'Critical thinking', 'Innovation in the workplace', 'Future of work', 'Gig economy', 'Freelancing', 'Entrepreneurship', 'Workplace trends', 'Digital transformation', 'Automation and AI in the workplace']
SEARCH_URL = "https://pantip.com/search"
BASE_URL = "https://pantip.com"
OUTPUT_FILE = "pantip_dataset.csv"
TOTAL_POST_LIMIT = 1000
PAGES_PER_KEYWORD = 50
DELAY_SECONDS = 1.5
SAVE_BATCH_SIZE = 20

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
}

def clean_text(text):
    if not text: return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_topic_id(url):
    match = re.search(r'/topic/(\d+)', url)
    return match.group(1) if match else None

def load_seen_ids():
    seen_ids = set()
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if 'topic_id' in row:
                        seen_ids.add(row['topic_id'])
            print(f"Loaded {len(seen_ids)} existing topic IDs from {OUTPUT_FILE}")
        except Exception as e:
            print(f"Warning: Could not read existing IDs: {e}")
    return seen_ids

def save_to_csv(data_list, mode='a'):
    if not data_list: return
    file_exists = os.path.exists(OUTPUT_FILE)
    keys = data_list[0].keys()
    try:
        with open(OUTPUT_FILE, mode, newline='', encoding='utf-8-sig') as f:
            dict_writer = csv.DictWriter(f, fieldnames=keys)
            if not file_exists or mode == 'w':
                dict_writer.writeheader()
            dict_writer.writerows(data_list)
        print(f"Successfully saved {len(data_list)} posts to {OUTPUT_FILE}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")

def get_post_links(keyword, page_number):
    links = []
    params = {'q': keyword, 'page': page_number}
    try:
        time.sleep(DELAY_SECONDS)
        response = requests.get(SEARCH_URL, params=params, headers=HEADERS, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        post_elements = soup.find_all('a', href=re.compile(r'/topic/\d+'))
        for elem in post_elements:
            link = elem.get('href')
            if link:
                full_link = link if link.startswith('http') else BASE_URL + link
                if full_link not in links:
                    links.append(full_link)
    except Exception as e:
        print(f"Error fetching search results (Page {page_number}): {e}")
    return links

def scrape_post_content(post_url):
    try:
        time.sleep(DELAY_SECONDS)
        response = requests.get(post_url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        title_elem = soup.find('h2', class_='display-post-title')
        body_elem = soup.find('div', class_='display-post-story')
        title = title_elem.get_text() if title_elem else ""
        body = body_elem.get_text() if body_elem else ""
        combined_text = f"{title}\n{body}"
        return clean_text(combined_text)
    except Exception as e:
        print(f"Error scraping post {post_url}: {e}")
        return None

def main():
    seen_ids = load_seen_ids()
    skipped_ids = set() # เก็บ ID ที่สั้นเกินไปในเซสชันนี้
    buffer = []
    total_scraped_this_run = 0
    current_total = len(seen_ids)
    
    print(f"Current dataset: {current_total} posts. Target: {TOTAL_POST_LIMIT}")
    if current_total >= TOTAL_POST_LIMIT: return

    try:
        for keyword in KEYWORDS:
            if current_total >= TOTAL_POST_LIMIT: break
            print(f"\n>>> Keyword: '{keyword}'")
            
            for page in range(1, PAGES_PER_KEYWORD + 1):
                if current_total >= TOTAL_POST_LIMIT: break
                links = get_post_links(keyword, page)
                if not links: break
                
                new_links_found = False
                for link in links:
                    topic_id = extract_topic_id(link)
                    
                    # ตรวจสอบว่าเคยดึงสำเร็จ หรือเคยข้ามไปแล้วหรือยัง
                    if not topic_id or topic_id in seen_ids or topic_id in skipped_ids:
                        continue
                    
                    new_links_found = True
                    print(f"Scraping [{current_total+1}/{TOTAL_POST_LIMIT}]: {link}")
                    text = scrape_post_content(link)
                    
                    # ปรับเป็น > 200 
                    if text and len(text) > 200: 
                        buffer.append({'topic_id': topic_id, 'text': text, 'label': 'Human'})
                        seen_ids.add(topic_id)
                        current_total += 1
                        total_scraped_this_run += 1
                        if len(buffer) >= SAVE_BATCH_SIZE:
                            save_to_csv(buffer)
                            buffer = []
                    else:
                        print(f"Skipping (Content too short).")
                        skipped_ids.add(topic_id)

                if not new_links_found:
                    print(f"No new topics on page {page}. Moving to next keyword.")
                    break
    
    except KeyboardInterrupt:
        print("\nInterrupted. Saving...")
    finally:
        if buffer: save_to_csv(buffer)
        print(f"\nDone. Added {total_scraped_this_run} posts. Final: {len(seen_ids)}")

if __name__ == "__main__":
    main()