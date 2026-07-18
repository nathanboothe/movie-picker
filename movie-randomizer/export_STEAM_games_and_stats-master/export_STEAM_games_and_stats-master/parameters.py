# To return owned games in STEAM form the URL with the following strings
steamLink = 'http://api.steampowered.com/'
ownedGames = 'IPlayerService/GetOwnedGames/v1?'
# Put in your Steam Key
steamKey = '&key=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
# Put in your Steam ID
steamID = '&steamid=XXXXXXXXXXXXXXXXX'
textFormat = '&format=json'
appInfo = '&include_appinfo=True'
freeGames = '&include_played_free_games=True'
steamLevel = 'IPlayerService/GetSteamLevel/v1?'
badgeLevel = 'IPlayerService/GetBadges/v1?'
recentlyPlayed = 'IPlayerService/GetRecentlyPlayedGames/v1?'
gamePageID = '12370'
gamePageData = 'https://store.steampowered.com/api/appdetails?appids='
friendsList = 'http://api.steampowered.com/ISteamUser/GetFriendList/v0001?'
playerSummaries = 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?'

# Create main list, use Bool values
mainList = True

# Create optional reports, use Bool values
optionalLists = True

# Fetch Steam friends library
fetchFriendsList = True

# Iterate through Steam Friends library
checkFriendsList = True

# Regex of keywords for HowLongToBeat game name search
keyWords = 'Single Player|Multi-Player|Multiplayer|&|:|-|Steam|The|Edition|Deluxe|Premium|Complete|HD|Definitive|Anniversary|Enhanced|\(.*?\)$'
