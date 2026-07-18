# csv exported STEAM games catalog combined with HowLongToBeat expected game playtime

# ABOUT

I've created this script as I wanted to export my Steam games catalog and various other game stats via Steam's API, combining it with the expacted game playtime from HowLongToBeat website https://howlongtobeat.com
All the gathered data is combined and exported into a csv file.

# EXPORTED DATA

The following data is exported for each item found in the STEAM catalog:

- ID - Steam item's ID number 
- Name - Steam item's game name
- Playtime total - Steam item's total playtime, shown in hours & minutes format 
- Total Votes - Steam item's total number of votes
- Total Positive Votes - Steam item's total positive number of votes
- Total Negative Votes - Steam item's total negative number of votes
- Score - Steam item's simple score calculation based on total Positive votes divided with total votes, shown in %
- Steam DB Score - Steam item's score calculation using their formula from the following link https://steamdb.info/blog/steamdb-rating/ , shown in %
- Main Story -  expected game time to beat the main story, data parsed from HowLongToBeat website, shown in hours
- Extra Content - expected game time to beat the main story + extra content, data parsed from HowLongToBeat website, shown in hours
- Complete - expected game time to beat the main story + extra content + all achievements available, data parsed from HowLongToBeat website, shown in hours

Data is exported to steam_catalog_list_data

# ADDITIONAL DATA EXPORTS

Some additional data is exported as json files.

- check_list_data.json - exports the HowLongToBeat game name search results for manual validation
- game_details_data.json - exports all the data from the item's Steam page
- owned_games_steam_data.json - list of owned Steam games shown as API request results
- recently_played_steam_data.json - list of recently played Steam games shown as API request results
- user_level_steam_data.json - Steam user's level and badge levels shown as API request results


 # DEPENDENCIES
- Python 3
    - hltbapi
    
Since How Long to Beat do not have their own API yet, I used a 3rd party API until I make my own: https://github.com/JaeguKim/HowLongToBeat-Python-API

#LICENSE
This repository is licensed under the MIT License.

#TODO
- optimise the script runtime, currently it processes around 50 Steam games per minute.
- optimise the HowLongToBeat search results, currently the search results returned are 95% correct.
- write my own HowLongToBeat API.
- differentiate HowLongToBeat multiplayer from singleplayer search results
- decide on the fate of the additional exported data



