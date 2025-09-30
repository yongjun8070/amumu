const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
}

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'amumu_land',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

pool.connect((err, client, done) => {
  if (err) {
    console.error('❌ 데이터베이스 연결 실패:', err);
  } else {
    console.log('✅ PostgreSQL 데이터베이스 연결 성공');
    done();
  }
});

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_API_BASE_URL = 'https://kr.api.riotgames.com';

console.log('🔑 Riot API Key:', RIOT_API_KEY ? 'API 키가 설정되었습니다' : '❌ API 키가 설정되지 않았습니다');

async function getSummonerByRiotId(gameName, tagLine) {
  try {
    console.log(`🔍 소환사 검색 중: ${gameName}#${tagLine}`);
    const response = await axios.get(
      `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { 
        headers: { 'X-Riot-Token': RIOT_API_KEY },
        timeout: 10000
      }
    );
    console.log('✅ 계정 정보 조회 성공');
    return response.data;
  } catch (error) {
    console.error('❌ 계정 정보 조회 실패:', error.response?.data || error.message);
    throw new Error('소환사를 찾을 수 없습니다. 닉네임과 태그를 확인해주세요.');
  }
}

async function getSummonerByPuuid(puuid) {
  try {
    console.log('🔍 소환사 상세 정보 조회 중...');
    const response = await axios.get(
      `${RIOT_API_BASE_URL}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      { 
        headers: { 'X-Riot-Token': RIOT_API_KEY },
        timeout: 10000
      }
    );
    console.log('✅ 소환사 상세 정보 조회 성공');
    return response.data;
  } catch (error) {
    console.error('❌ 소환사 정보 조회 실패:', error.response?.data || error.message);
    throw new Error('소환사 정보를 가져올 수 없습니다.');
  }
}

async function getRankedStats(encryptedPUUID) {
  try {
    console.log('🏆 랭크 정보 조회 중...');
    const response = await axios.get(
      `${RIOT_API_BASE_URL}/lol/league/v4/entries/by-puuid/${encryptedPUUID}`,
      { 
        headers: { 'X-Riot-Token': RIOT_API_KEY },
        timeout: 10000
      }
    );
    console.log(`✅ 랭크 정보 조회 성공: ${response.data.length}개 큐 정보`);
    return response.data;
  } catch (error) {
    console.error('❌ 랭크 정보 조회 실패:', error.response?.data || error.message);
    return [];
  }
}

function calculateTierScore(tier, rank, lp) {
  const tierScores = {
    'UNRANKED': 0,
    'IRON': 100,
    'BRONZE': 500,
    'SILVER': 900,
    'GOLD': 1300,
    'PLATINUM': 1700,
    'EMERALD': 2100,
    'DIAMOND': 2500,
    'MASTER': 2900,
    'GRANDMASTER': 3200,
    'CHALLENGER': 3500
  };
  
  const rankScores = { 'IV': 0, 'III': 100, 'II': 200, 'I': 300 };
  
  let baseScore = tierScores[tier] || 0;
  if (tier && tier !== 'MASTER' && tier !== 'GRANDMASTER' && tier !== 'CHALLENGER') {
    baseScore += rankScores[rank] || 0;
  }
  
  return baseScore + (lp || 0);
}

app.get('/', (req, res) => {
  res.json({ 
    message: '🎮 아무무 랜드 API 서버가 실행 중입니다!',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      database: 'connected',
      api_key: RIOT_API_KEY ? 'configured' : 'missing',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/members', async (req, res) => {
  const { summonerName, tagLine } = req.body;
  
  console.log(`📝 새 멤버 추가 요청: ${summonerName}#${tagLine}`);
  
  if (!summonerName || !tagLine) {
    return res.status(400).json({ error: '소환사명과 태그를 모두 입력해주세요.' });
  }

  if (!RIOT_API_KEY) {
    return res.status(500).json({ error: 'Riot API 키가 설정되지 않았습니다.' });
  }
  
  try {
    const riotAccount = await getSummonerByRiotId(summonerName.trim(), tagLine.trim());
    const summoner = await getSummonerByPuuid(riotAccount.puuid);
    const rankedStats = await getRankedStats(riotAccount.puuid);
    
    const existingMember = await pool.query('SELECT id FROM members WHERE puuid = $1', [riotAccount.puuid]);
    if (existingMember.rows.length > 0) {
      console.log('⚠️ 이미 등록된 멤버');
      return res.status(400).json({ error: '이미 등록된 멤버입니다.' });
    }
    
    console.log('💾 멤버 데이터베이스에 저장 중...');
    const memberResult = await pool.query(
      `INSERT INTO members (summoner_name, tag_line, puuid, summoner_id, profile_icon_id, summoner_level) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [riotAccount.gameName, riotAccount.tagLine, riotAccount.puuid, riotAccount.puuid, summoner.profileIconId, summoner.summonerLevel]
    );
    
    const memberId = memberResult.rows[0].id;
    
    console.log(`💾 랭크 정보 저장 중... (${rankedStats.length}개)`);
    for (const rank of rankedStats) {
      await pool.query(
        `INSERT INTO member_ranks (member_id, queue_type, tier, rank_level, league_points, wins, losses)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [memberId, rank.queueType, rank.tier, rank.rank, rank.leaguePoints, rank.wins, rank.losses]
      );
    }
    
    await pool.query(
      'INSERT INTO member_rankings (member_id, rating) VALUES ($1, $2)',
      [memberId, 0]
    );
    
    console.log('✅ 멤버 추가 완료');
    res.json({ 
      success: true, 
      member: memberResult.rows[0],
      message: `${riotAccount.gameName}#${riotAccount.tagLine} 멤버가 성공적으로 추가되었습니다!`
    });
  } catch (error) {
    console.error('❌ 멤버 추가 실패:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/members', async (req, res) => {
  try {
    console.log('📋 멤버 목록 조회 중...');
    const result = await pool.query(`
      SELECT m.*, 
             mr.tier as solo_tier, mr.rank_level as solo_rank, mr.league_points as solo_lp,
             mr2.tier as flex_tier, mr2.rank_level as flex_rank, mr2.league_points as flex_lp,
             ranking.rating, ranking.wins, ranking.losses, ranking.total_matches
      FROM members m
      LEFT JOIN member_ranks mr ON m.id = mr.member_id AND mr.queue_type = 'RANKED_SOLO_5x5'
      LEFT JOIN member_ranks mr2 ON m.id = mr2.member_id AND mr2.queue_type = 'RANKED_FLEX_SR'
      LEFT JOIN member_rankings ranking ON m.id = ranking.member_id
      ORDER BY m.created_at DESC
    `);
    
    console.log(`✅ 멤버 목록 조회 완료: ${result.rows.length}명`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ 멤버 목록 조회 실패:', error);
    res.status(500).json({ error: '멤버 목록을 가져오는데 실패했습니다.' });
  }
});

app.delete('/api/members/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ 멤버 삭제 요청: ID ${id}`);
  
  try {
    const memberCheck = await pool.query('SELECT summoner_name FROM members WHERE id = $1', [id]);
    
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: '멤버를 찾을 수 없습니다.' });
    }
    
    const summonerName = memberCheck.rows[0].summoner_name;
    await pool.query('DELETE FROM members WHERE id = $1', [id]);
    
    console.log(`✅ 멤버 삭제 완료: ${summonerName} (ID: ${id})`);
    
    res.json({ 
      success: true, 
      message: `${summonerName} 멤버가 삭제되었습니다.` 
    });
    
  } catch (error) {
    console.error('❌ 멤버 삭제 실패:', error);
    res.status(500).json({ error: '멤버 삭제에 실패했습니다.' });
  }
});

app.put('/api/members/:id/refresh', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔄 멤버 ${id} 랭크 정보 갱신 중...`);
  
  try {
    const member = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    
    if (member.rows.length === 0) {
      return res.status(404).json({ error: '멤버를 찾을 수 없습니다.' });
    }
    
    const rankedStats = await getRankedStats(member.rows[0].puuid);
    
    await pool.query('DELETE FROM member_ranks WHERE member_id = $1', [id]);
    
    for (const rank of rankedStats) {
      await pool.query(
        `INSERT INTO member_ranks (member_id, queue_type, tier, rank_level, league_points, wins, losses)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, rank.queueType, rank.tier, rank.rank, rank.leaguePoints, rank.wins, rank.losses]
      );
    }
    
    console.log(`✅ 랭크 정보 갱신 완료: ${rankedStats.length}개`);
    res.json({ success: true, message: '랭크 정보가 갱신되었습니다.', count: rankedStats.length });
    
  } catch (error) {
    console.error('❌ 랭크 정보 갱신 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/members/:id/preferences', async (req, res) => {
  const { id } = req.params;
  const { preferredPositions, avoidedPositions } = req.body;
  
  try {
    console.log(`⚙️ 멤버 ${id} 포지션 선호도 설정 중...`);
    await pool.query(
      `INSERT INTO member_preferences (member_id, preferred_positions, avoided_positions)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_id) 
       DO UPDATE SET 
         preferred_positions = $2,
         avoided_positions = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [id, preferredPositions, avoidedPositions]
    );
    
    console.log('✅ 포지션 선호도 설정 완료');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ 선호도 설정 실패:', error);
    res.status(500).json({ error: '선호도 설정에 실패했습니다.' });
  }
});

app.post('/api/matches/balance-teams', async (req, res) => {
  const { memberIds } = req.body;
  
  console.log(`⚖️ 팀 밸런싱 요청: ${memberIds.length}명`);
  
  if (memberIds.length !== 10) {
    return res.status(400).json({ error: '정확히 10명의 멤버를 선택해주세요.' });
  }
  
  try {
    const membersResult = await pool.query(`
      SELECT m.id, m.summoner_name,
             COALESCE(mr.tier, 'UNRANKED') as solo_tier,
             COALESCE(mr.rank_level, 'IV') as solo_rank,
             COALESCE(mr.league_points, 0) as solo_lp,
             COALESCE(mr2.tier, 'UNRANKED') as flex_tier,
             COALESCE(mr2.rank_level, 'IV') as flex_rank,
             COALESCE(mr2.league_points, 0) as flex_lp,
             mp.preferred_positions,
             mp.avoided_positions
      FROM members m
      LEFT JOIN member_ranks mr ON m.id = mr.member_id AND mr.queue_type = 'RANKED_SOLO_5x5'
      LEFT JOIN member_ranks mr2 ON m.id = mr2.member_id AND mr2.queue_type = 'RANKED_FLEX_SR'
      LEFT JOIN member_preferences mp ON m.id = mp.member_id
      WHERE m.id = ANY($1)
    `, [memberIds]);
    
    const members = membersResult.rows;
    const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
    
    members.forEach(member => {
      const soloScore = calculateTierScore(member.solo_tier, member.solo_rank, member.solo_lp);
      const flexScore = calculateTierScore(member.flex_tier, member.flex_rank, member.flex_lp);
      member.totalScore = Math.round(soloScore * 0.7 + flexScore * 0.3);
    });
    
    members.sort((a, b) => b.totalScore - a.totalScore);
    
    const blueTeam = [];
    const redTeam = [];
    let blueScore = 0, redScore = 0;
    
    for (const member of members) {
      if (blueTeam.length < 5 && (redTeam.length === 5 || blueScore <= redScore)) {
        blueTeam.push(member);
        blueScore += member.totalScore;
      } else {
        redTeam.push(member);
        redScore += member.totalScore;
      }
    }
    
    const bluePositions = assignPositions(blueTeam, positions);
    const redPositions = assignPositions(redTeam, positions);
    
    console.log(`✅ 팀 밸런싱 완료 - 블루: ${blueScore}점, 레드: ${redScore}점`);
    
    res.json({
      blueTeam: blueTeam.map((member, idx) => ({
        ...member,
        position: bluePositions[idx]
      })),
      redTeam: redTeam.map((member, idx) => ({
        ...member,
        position: redPositions[idx]
      })),
      blueScore,
      redScore,
      scoreDifference: Math.abs(blueScore - redScore)
    });
    
  } catch (error) {
    console.error('❌ 팀 밸런싱 실패:', error);
    res.status(500).json({ error: '팀 밸런싱에 실패했습니다.' });
  }
});

function assignPositions(team, positions) {
  const assigned = new Array(5).fill(null);
  const availablePositions = [...positions];
  
  team.forEach((member, idx) => {
    if (member.preferred_positions && member.preferred_positions.length > 0) {
      for (const prefPos of member.preferred_positions) {
        const posIdx = availablePositions.indexOf(prefPos);
        if (posIdx !== -1) {
          assigned[idx] = prefPos;
          availablePositions.splice(posIdx, 1);
          return;
        }
      }
    }
  });
  
  team.forEach((member, idx) => {
    if (!assigned[idx] && availablePositions.length > 0) {
      let posToAssign = null;
      for (const pos of availablePositions) {
        if (!member.avoided_positions || !member.avoided_positions.includes(pos)) {
          posToAssign = pos;
          break;
        }
      }
      
      if (!posToAssign && availablePositions.length > 0) {
        posToAssign = availablePositions[0];
      }
      
      if (posToAssign) {
        assigned[idx] = posToAssign;
        const posIdx = availablePositions.indexOf(posToAssign);
        availablePositions.splice(posIdx, 1);
      }
    }
  });
  
  team.forEach((member, idx) => {
    if (!assigned[idx] && availablePositions.length > 0) {
      assigned[idx] = availablePositions.shift();
    }
  });
  
  return assigned;
}

app.post('/api/matches', async (req, res) => {
  const { matchName, blueTeam, redTeam, winner } = req.body;
  
  console.log(`🏆 내전 결과 저장: ${matchName} - ${winner}팀 승리`);
  
  try {
    const matchResult = await pool.query(`
      INSERT INTO matches (match_name, blue_team_members, red_team_members, blue_team_positions, red_team_positions, winner)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [
      matchName,
      blueTeam.map(m => m.id),
      redTeam.map(m => m.id),
      blueTeam.map(m => m.position),
      redTeam.map(m => m.position),
      winner
    ]);
    
    const allMembers = [...blueTeam, ...redTeam];
    
    for (const member of allMembers) {
      const isWinner = (winner === 'blue' && blueTeam.includes(member)) || 
                      (winner === 'red' && redTeam.includes(member));
      const ratingChange = isWinner ? 10 : -7;
      
      await pool.query(`
        UPDATE member_rankings 
        SET rating = rating + $1,
            wins = wins + $2,
            losses = losses + $3,
            total_matches = total_matches + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE member_id = $4
      `, [ratingChange, isWinner ? 1 : 0, isWinner ? 0 : 1, member.id]);
    }
    
    console.log('✅ 내전 결과 저장 완료');
    res.json({ 
      success: true, 
      match: matchResult.rows[0],
      message: '경기 결과가 성공적으로 저장되었습니다!'
    });
    
  } catch (error) {
    console.error('❌ 경기 결과 저장 실패:', error);
    res.status(500).json({ error: '경기 결과 저장에 실패했습니다.' });
  }
});

app.get('/api/rankings', async (req, res) => {
  try {
    console.log('🏆 랭킹 조회 중...');
    
    const result = await pool.query(`
      SELECT 
        m.summoner_name, 
        m.tag_line, 
        COALESCE(mr.rating, 0) as rating, 
        COALESCE(mr.wins, 0) as wins, 
        COALESCE(mr.losses, 0) as losses, 
        COALESCE(mr.total_matches, 0) as total_matches,
        CASE 
          WHEN COALESCE(mr.total_matches, 0) > 0 
          THEN ROUND((COALESCE(mr.wins, 0)::numeric / COALESCE(mr.total_matches, 0)::numeric) * 100, 1)
          ELSE 0 
        END as win_rate
      FROM members m
      LEFT JOIN member_rankings mr ON mr.member_id = m.id
      ORDER BY COALESCE(mr.rating, 0) DESC, m.summoner_name ASC
    `);
    
    console.log(`✅ 랭킹 조회 완료: ${result.rows.length}명`);
    res.json(result.rows || []);
    
  } catch (error) {
    console.error('❌ 랭킹 조회 실패:', error.message);
    res.status(200).json([]);
  }
});

app.get('/api/matches', async (req, res) => {
  try {
    console.log('📋 경기 기록 조회 중...');
    const result = await pool.query(`
      SELECT m.*,
             array_agg(DISTINCT mem1.summoner_name) FILTER (WHERE mem1.id = ANY(m.blue_team_members)) as blue_team_names,
             array_agg(DISTINCT mem2.summoner_name) FILTER (WHERE mem2.id = ANY(m.red_team_members)) as red_team_names
      FROM matches m
      LEFT JOIN members mem1 ON mem1.id = ANY(m.blue_team_members)
      LEFT JOIN members mem2 ON mem2.id = ANY(m.red_team_members)
      GROUP BY m.id
      ORDER BY m.match_date DESC
      LIMIT 50
    `);
    
    console.log(`✅ 경기 기록 조회 완료: ${result.rows.length}경기`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ 경기 기록 조회 실패:', error);
    res.status(500).json({ error: '경기 기록을 가져오는데 실패했습니다.' });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('❌ 서버 에러:', err.stack);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

app.listen(PORT, () => {
  console.log('\n🎮======================================🎮');
  console.log('🎮     아무무 랜드 서버 시작 완료!     🎮');
  console.log('🎮======================================🎮');
  console.log(`🌐 서버 주소: http://localhost:${PORT}`);
  console.log(`🗄️ 데이터베이스: ${process.env.DB_NAME}`);
  console.log(`🔑 API 키: ${RIOT_API_KEY ? '✅ 설정됨' : '❌ 미설정'}`);
  console.log(`📊 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log('🎮======================================🎮\n');
});
