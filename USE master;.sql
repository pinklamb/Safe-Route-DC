CREATE TABLE #crimes (
  id INT IDENTITY PRIMARY KEY,
  lat FLOAT,
  lng FLOAT,
  crime_type NVARCHAR(100),
  date_occurred DATE
);