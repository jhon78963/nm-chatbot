#!/bin/sh
# check-programs.sh — Counts active programs and shows a sample from MongoDB

cd /opt/chatbot-uprit

MONGODB_URI=$(grep '^MONGODB_URI=' .env | cut -d= -f2-)
MONGODB_DB=$(grep '^MONGODB_DB_NAME=' .env | cut -d= -f2-)

mongosh "$MONGODB_URI/$MONGODB_DB" --quiet --eval '
  const n = db.programs.countDocuments({status:"active"});
  print("Active programs: " + n);
  if(n > 0){
    const p = db.programs.findOne({status:"active"},{name:1,iaInformation:1,faq:1,admissionRequirements:1,_id:0});
    print("Name: " + p.name);
    print("Has iaInformation: " + !!(p.iaInformation && p.iaInformation.length > 10));
    print("FAQ entries: " + (p.faq||[]).length);
    print("Admission req: " + (p.admissionRequirements||[]).length);
  } else {
    print("WARNING: No active programs in DB. The bot will use the fallback system prompt.");
    print("Add programs with status=active and fill iaInformation field.");
  }
' 2>&1 | grep -v "^Current Mongosh\|^Using MongoDB\|^Using Mongosh\|^MongoshWarning\|^\s*$"
