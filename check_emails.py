import os
from supabase import create_client
import datetime

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("sb_publishable_1xfyqIIcZWTseIifVLgYUQ_YQLjbl-x") # Using the key from context if available, but usually we use admin key in sandbox if possible. 
# Actually, I'll just use the supabase--read_query tool which is safer.
