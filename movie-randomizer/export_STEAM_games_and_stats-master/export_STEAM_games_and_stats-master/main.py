#!/usr/bin/env python
# -*- coding: utf-8 -*-

import requests
import json
import csv
import os
import math
import re
from hltbapi import HtmlScraper
import datetime
import parameters
os.getcwd()

# Export file to JSON
def exportJSON(file, name):
    with open(name + '_data.json', 'w', encoding='utf-8') as jsonfile:
        json.dump(file, jsonfile, ensure_ascii=False, indent=4)

# Return review numbers of owned STEAM games
def getGameReviews(gameID):
    try:
        gameReviews = requests.get('https://store.steampowered.com/appreviews/' + gameID
                                    + '?json=1&language=all&purchase_type=all').json()
    except:
        return 'Error', 'Error', 'Error', 'Error', 'Error'
    totalVotes = gameReviews['query_summary']['total_reviews']
    if totalVotes == 0:
        return 0, 0, 0, 0, 0
    else:
        totalPositive = gameReviews['query_summary']['total_positive']
        totalNegative = gameReviews['query_summary']['total_negative']
        reviewScore = totalPositive / totalVotes
        rating = reviewScore - (reviewScore - 0.5) * math.pow(2, - math.log10(totalVotes + 1))
        return totalVotes, totalPositive, totalNegative, (round(reviewScore * 100)), (round(rating * 100))

# Get the game tags from the Steam product page
def getGameTags(gameID):
    gameTags = []
    try:
        getGameDetails = requests.get(parameters.gamePageData + gameID).json()
        gameTag = getGameDetails[gameID]['data']['categories']
        for tag in gameTag:
            gameTags.append(tag['description'])
    except:
        gameTags.append('Page not found')
    finally:
        return ", ".join(gameTags)

# Scrap expected game length times per play style from HowLongToBeat website
def getHowLongToBeat(name):
    # Using checklist to check steam name searches in HowLongToBeat base
    # Using regex to exclude mismatches between steam and HowLongToBeat game names
    name = re.sub(parameters.keyWords, ' ', name)
    # Remove utf-8 coded text for better search results
    encodeName = name.encode(encoding='ascii', errors='ignore')
    decodeName = encodeName.decode()
    try:
        howLongToBeat = HtmlScraper().search(decodeName)[0]
        avgSum = []
        print(howLongToBeat.timeLabels) ################# remove this
        gameplayMain = round(howLongToBeat.gameplayMain)
        gameplayExtra = round(howLongToBeat.gameplayMainExtra)
        gameplayComplete = round(howLongToBeat.gameplayCompletionist)
        if gameplayMain != 0:
            avgSum.append(gameplayMain)
        if gameplayExtra != 0:
            avgSum.append(gameplayExtra)
        if gameplayComplete != 0:
            avgSum.append(gameplayComplete)
        avgMedian = round(sum(avgSum)/len(avgSum))
        return gameplayMain, gameplayExtra, gameplayComplete, avgMedian, \
               decodeName + ' -> ' + howLongToBeat.gameName
    except:
        print("ERROR! ITEM NOT FOUND -> " + decodeName)
        return 'Error', 'Error', 'Error', 'Error', decodeName + ' -> NOT FOUND!'

# Get optional JSON lists for various Steam account statistics
def optionalLists():
    # Get the Steam user and badge level
    getSteamLvl = requests.get(parameters.steamLink + parameters.steamLevel + parameters.steamID
                               + parameters.steamKey)
    getBadgeLvl = requests.get(parameters.steamLink + parameters.badgeLevel + parameters.steamID
                               + parameters.steamKey)
    exportJSON([getSteamLvl.json(), getBadgeLvl.json()], name='user_level_steam')

    # Get recently played STEAM games
    getRecentlyPlayed = requests.get(parameters.steamLink + parameters.recentlyPlayed + parameters.steamID
                                     + parameters.steamKey)
    exportJSON(getRecentlyPlayed.json(), name='recently_played_steam')

    # Get game's Steam page details
    getGameDetails = requests.get(parameters.gamePageData + parameters.gamePageID)
    exportJSON(getGameDetails.json(), name='game_details')

def friendsList():
    # Get Steam friends list names
    getFriendsList = requests.get(parameters.friendsList + parameters.steamKey + parameters.steamID + '&relationship = friend')
    steamFriendIDList = []
    friends = getFriendsList.json()['friendslist']['friends']
    for ID in friends:
        steamFriendIDList.append(ID['steamid'])
    listID = ','.join(steamFriendIDList)

    # Get Steam friends list IDs
    getPlayerSummaries = (requests.get(parameters.playerSummaries + parameters.steamKey + '&steamids=' + listID))
    steamFriendNameID = {}
    playerNames = getPlayerSummaries.json()['response']['players']
    for name in playerNames:
        steamFriendNameID[name['personaname']] = name['steamid']
    exportJSON(steamFriendNameID, name='friends_ids')

    # Get Steam friends libraries
    steamFriendLibrary = steamFriendNameID
    for id in steamFriendLibrary:
        getFriendGames = (requests.get(parameters.steamLink + parameters.ownedGames + parameters.steamKey
                                      + '&steamid=' + steamFriendNameID[id] + parameters.textFormat + parameters.appInfo
                                      + parameters.freeGames)).json()

        for friendName in steamFriendLibrary:
            if friendName == id:
                steamFriendLibrary[friendName] = getFriendGames

    exportJSON(steamFriendLibrary, name='friends_owned_games_steam')
    return steamFriendLibrary

    # Rank the game times per length ranking
def gameTimeRange(gameTime):
    if gameTime == 'Error':
        return'Error'
    elif gameTime == 0:
        return '0'
    elif gameTime > 0 and gameTime <= 5:
        return '5'
    elif gameTime > 5 and gameTime <= 10:
        return '10'
    elif gameTime > 10 and gameTime <= 20:
        return '20'
    elif gameTime > 20 and gameTime <= 30:
        return '30'
    elif gameTime > 30 and gameTime <= 40:
        return '40'
    elif gameTime > 40 and gameTime <= 50:
        return '50'
    elif gameTime > 50 and gameTime <= 60:
        return '60'
    elif gameTime > 60 and gameTime <= 70:
        return '70'
    elif gameTime > 70 and gameTime <= 80:
        return '80'
    elif gameTime > 80 and gameTime <= 90:
        return '90'
    elif gameTime > 90 and gameTime <= 100:
        return '100'
    else: # gameTime > 100:
        return '100+'

def main():
    begin_time = datetime.datetime.now()  # TODO use timeit

    # Return owned STEAM games list
    getOwnedGames = (requests.get(parameters.steamLink + parameters.ownedGames + parameters.steamKey
                                  + parameters.steamID + parameters.textFormat + parameters.appInfo
                                  + parameters.freeGames)).json()
    exportJSON(getOwnedGames, name='owned_games_steam')

    # Get the total count of Steam games
    gamesTotal = ["Total Steam game count: " + str(getOwnedGames['response']['game_count'])]
    rowTags = ['count', 'ID', 'Game Name', 'Steam Playtime(h)', 'Main Story(h)', 'Extra Content(h)', 'Complete(h)',
               'Average(h)', 'Total Votes', 'Total Positive', 'Total Negative', 'Score(%)', 'Steam db Score(%)',
               'Tags', 'Friends',
               'Story Range(h)', 'Extra Range(h)', 'Complete Range(h)', 'Average Range(h)']

    # Get the game IDs, names, total playtime per title, total vote numbers, total positive and negative numbers
    gameItems = []
    checkList = []
    gameList = (getOwnedGames['response']['games'])
    oldCount = 0
    # Fetch friends steam libraries
    if parameters.fetchFriendsList:
        friendsLibrary = friendsList()
    print("Going through the user's Steam library")
    for count, item in enumerate(gameList, 1):
        # Show the progress of the list done in percentage till 100%
        newCount = int(count / len(gameList) * 100)
        if newCount != oldCount:
            oldCount = newCount
            print('--->List done: ' + str(newCount) + '%<---')
        appID = item['appid']
        name = item['name']
        print(count, name) ################ remove this
        steamMin = item['playtime_forever']
        # Turn total playtime minutes into hours
        # steamTime = str(int(steamMin / 60)) + 'h ' + str(steamMin % 60) + 'min'  # use this to get hours and minutes
        steamTime = str(round(steamMin/60))
        story, extra, complete, avgMedian, gameName = getHowLongToBeat(name=(str(item['name'])))
        total, positive, negative, score, steamScore = getGameReviews(str(item['appid']))
        # Iterate through friends library and check for matching game IDs
        if parameters.checkFriendsList:
            friends = []
            #f = open('friends_owned_games_steam_data.json')
            # friendsLibrary = json.load(f)
            for friendName in friendsLibrary.items():
                if friendName[0] != "Shara": # Shara's list is empty
                        try:
                            gamesList = friendName[1]['response']['games']
                            for app in gamesList:
                                if appID == app['appid']:
                                    friends.append(friendName[0])
                                    break
                        except:
                            print("ERROR: " + friendName[0] + " games list not found!")
            friendTags = ','.join(friends)
        else:
            friendTags = ''
        gameTags = getGameTags(str(item['appid']))
        # Form the data
        gameItems.append([count, appID, name, steamTime,
                          story, extra, complete, avgMedian,
                          total, positive, negative, score, steamScore,
                          gameTags, friendTags,
                          gameTimeRange(story), gameTimeRange(extra), gameTimeRange(complete), gameTimeRange(avgMedian)
                          ])
        checkList.append(gameName)

    # Export to JSON file
    exportJSON((rowTags, gameItems), name='game_list')
    exportJSON(checkList, name='check_list')

    # Export to CSV file
    with open('steam_catalog_list_data.csv', 'w', encoding='UTF8', newline='') as csvfile:
        writer = csv.writer(csvfile)
        # writer.writerow(gamesTotal)
        writer.writerow(rowTags)
        writer.writerows(gameItems)

    print(gamesTotal)
    print(datetime.datetime.now() - begin_time)  # TODO use timeit

if __name__ == '__main__':
    if parameters.optionalLists:
        optionalLists()
    if parameters.mainList:
        main()