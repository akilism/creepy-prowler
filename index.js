const fs = require('fs');
const path = require('path');
const sqlite = require('sqlite');

function findDB() {
  // looking for /private/var/folders/.../com.apple.notificationcenter/db

  function crawl(localPath, checkPath, pathsToCheck) {
    if (localPath.indexOf(checkPath) !== -1) {
      if (checkPath === 'com.apple.notificationcenter') {
        try {
          let files = fs.readdirSync(localPath);
          let paths = files.map(f => path.join(localPath, f)).filter(f => {
            const stat = fs.statSync(f);
            return stat.isDirectory();
          });
          return crawl(paths.shift(), 'db', paths);
        } catch (error) {
          console.log(`Couldn't find a DB @ ${localPath}/`);
        }
      }
      console.log(`Found DB @ ${localPath}/db`);
      return localPath;
    }
    try {
      let files = fs.readdirSync(localPath);
      files = files.map(f => path.join(localPath, f)).filter(f => {
        const stat = fs.statSync(f);
        return stat.isDirectory();
      });
      let paths = pathsToCheck.concat(files);
      return crawl(paths.shift(), checkPath, paths);
    } catch (error) {
      return crawl(pathsToCheck.shift(), checkPath, pathsToCheck);
    }
  }

  return crawl('/private/var/folders', 'com.apple.notificationcenter', []);
}

async function cleanDb(dbPath) {
  const dbProm = sqlite.open(`${dbPath}/db`, { Promise });
  const db = await dbProm;
  const signalID = await db.get(
    `SELECT app_id FROM app_info WHERE bundleid = ?`,
    'org.whispersystems.signal-desktop'
  );

  if (!signalID || !signalID.app_id) {
    console.log('Could Not Find a Signal-Desktop app_id!');
    process.exit(0);
  }

  let notifications = await db.all(
    `SELECT * FROM notifications WHERE app_id = ?`,
    signalID.app_id
  );

  console.log(
    `Found ${notifications.length} Signal Notification${
      notifications.length === 1 ? '' : 's'
    }.`
  );

  if (notifications.length === 0) {
    console.log('All Clean!');
    process.exit(0);
  }

  if (process.argv[2] == 'wipe') {
    console.log(`Cleaning DB @ ${dbPath}/db`);
    db.run(`DELETE FROM notifications WHERE app_id = ?`, signalID.app_id);
    notifications = await db.all(
      `SELECT * FROM notifications WHERE app_id = ?`,
      signalID.app_id
    );

    console.log(
      `Found ${notifications.length} Signal Notifications After Cleaning`
    );

    if (notifications.length === 0) {
      console.log('All Clean!');
      process.exit(0);
    }
  }
}

if (process.argv[2] && process.argv[2].indexOf('-h') > -1) {
  console.log(`Signal Notification Wiper.
usage: prowl [options]

Options
  wipe - delete all found signal notifications from your local db.
`);
} else {
  const dbPath = findDB();
  cleanDb(dbPath);
}
