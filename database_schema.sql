-- 멤버 테이블
CREATE TABLE members (
    id SERIAL PRIMARY KEY,
    summoner_name VARCHAR(100) NOT NULL,
    tag_line VARCHAR(10) NOT NULL,
    puuid VARCHAR(100) UNIQUE NOT NULL,
    summoner_id VARCHAR(100) NOT NULL,
    profile_icon_id INTEGER,
    summoner_level INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 랭크 정보 테이블
CREATE TABLE member_ranks (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
    queue_type VARCHAR(20) NOT NULL,
    tier VARCHAR(20),
    rank_level VARCHAR(5),
    league_points INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 포지션 선호도 테이블
CREATE TABLE member_preferences (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
    preferred_positions TEXT[],
    avoided_positions TEXT[],
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 내전 경기 테이블
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    match_name VARCHAR(100),
    blue_team_members INTEGER[],
    red_team_members INTEGER[],
    blue_team_positions TEXT[],
    red_team_positions TEXT[],
    winner VARCHAR(10),
    match_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES members(id)
);

-- 내전 랭킹 테이블
CREATE TABLE member_rankings (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
    rating INTEGER DEFAULT 1000,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_matches INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_members_puuid ON members(puuid);
CREATE INDEX idx_member_ranks_member_id ON member_ranks(member_id);
CREATE INDEX idx_member_rankings_rating ON member_rankings(rating DESC);
