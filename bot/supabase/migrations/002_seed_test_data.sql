-- TEST DATA ONLY — run in test/dev environment, not production
-- Seeds 32 fake bracket participants + 1 pending tournament

DO $$
DECLARE
  t_id uuid;
BEGIN

INSERT INTO couchcup.tournaments (name, game, max_participants, status)
VALUES ('Couch Cup Season 1', 'EA FC 26', 32, 'pending')
RETURNING id INTO t_id;

INSERT INTO couchcup.participants (name, email, psn_id, discord_id, status)
VALUES
  ('Player 01','p01@test.com','PSN_Player01','111000000000000001','bracket'),
  ('Player 02','p02@test.com','PSN_Player02','111000000000000002','bracket'),
  ('Player 03','p03@test.com','PSN_Player03','111000000000000003','bracket'),
  ('Player 04','p04@test.com','PSN_Player04','111000000000000004','bracket'),
  ('Player 05','p05@test.com','PSN_Player05','111000000000000005','bracket'),
  ('Player 06','p06@test.com','PSN_Player06','111000000000000006','bracket'),
  ('Player 07','p07@test.com','PSN_Player07','111000000000000007','bracket'),
  ('Player 08','p08@test.com','PSN_Player08','111000000000000008','bracket'),
  ('Player 09','p09@test.com','PSN_Player09','111000000000000009','bracket'),
  ('Player 10','p10@test.com','PSN_Player10','111000000000000010','bracket'),
  ('Player 11','p11@test.com','PSN_Player11','111000000000000011','bracket'),
  ('Player 12','p12@test.com','PSN_Player12','111000000000000012','bracket'),
  ('Player 13','p13@test.com','PSN_Player13','111000000000000013','bracket'),
  ('Player 14','p14@test.com','PSN_Player14','111000000000000014','bracket'),
  ('Player 15','p15@test.com','PSN_Player15','111000000000000015','bracket'),
  ('Player 16','p16@test.com','PSN_Player16','111000000000000016','bracket'),
  ('Player 17','p17@test.com','PSN_Player17','111000000000000017','bracket'),
  ('Player 18','p18@test.com','PSN_Player18','111000000000000018','bracket'),
  ('Player 19','p19@test.com','PSN_Player19','111000000000000019','bracket'),
  ('Player 20','p20@test.com','PSN_Player20','111000000000000020','bracket'),
  ('Player 21','p21@test.com','PSN_Player21','111000000000000021','bracket'),
  ('Player 22','p22@test.com','PSN_Player22','111000000000000022','bracket'),
  ('Player 23','p23@test.com','PSN_Player23','111000000000000023','bracket'),
  ('Player 24','p24@test.com','PSN_Player24','111000000000000024','bracket'),
  ('Player 25','p25@test.com','PSN_Player25','111000000000000025','bracket'),
  ('Player 26','p26@test.com','PSN_Player26','111000000000000026','bracket'),
  ('Player 27','p27@test.com','PSN_Player27','111000000000000027','bracket'),
  ('Player 28','p28@test.com','PSN_Player28','111000000000000028','bracket'),
  ('Player 29','p29@test.com','PSN_Player29','111000000000000029','bracket'),
  ('Player 30','p30@test.com','PSN_Player30','111000000000000030','bracket'),
  ('Player 31','p31@test.com','PSN_Player31','111000000000000031','bracket'),
  ('Player 32','p32@test.com','PSN_Player32','111000000000000032','bracket');

END $$;
