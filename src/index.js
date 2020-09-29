const ldap =require('ldapjs');
const port = process.env.MOCK_LDAP_PORT || '1389';
const runMockLDAPServer = async () => {
  ///--- Shared handlers
  await (async () => {
    function authorize(req, res, next) {
      /* Any user may search after bind, only cn=root has full power */
      const isSearch = req instanceof ldap.SearchRequest;
      if (!req.connection.ldap.bindDN.equals('cn=root') && !isSearch)
        return next(new ldap.InsufficientAccessRightsError());

      return next();
    }

    ///--- Globals

    const SUFFIX = 'o=testultrax';
    const db = {};
    const ldapServer = ldap.createServer();

    ldapServer.bind('cn=root', function(req, res, next) {
      if (req.dn.toString() !== 'cn=root' || req.credentials !== 'secret')
        return next(new ldap.InvalidCredentialsError());

      res.end();
      return next();
    });

    ldapServer.add(SUFFIX, authorize, function(req, res, next) {
      const dn = req.dn.toString();
      const cn = req.dn.rdns[0].toString();
      if (db[cn]) return next(new ldap.EntryAlreadyExistsError(dn));
      db[cn] = req.toObject().attributes;
      res.end();
      return next();
    });

    ldapServer.bind(SUFFIX, function(req, res, next) {
      const dn = req.dn.toString();
      const cn = req.dn.rdns[0].toString();
      if (!db[cn]) return next(new ldap.NoSuchObjectError(dn));

      if (!db[cn].userpassword)
        return next(new ldap.NoSuchAttributeError('userPassword'));

      if (db[cn].userpassword.indexOf(req.credentials) === -1)
        return next(new ldap.InvalidCredentialsError());

      res.end();
      return next();
    });

    ldapServer.compare(SUFFIX, authorize, function(req, res, next) {
      const dn = req.dn.toString();
      if (!db[dn]) return next(new ldap.NoSuchObjectError(dn));

      if (!db[dn][req.attribute])
        return next(new ldap.NoSuchAttributeError(req.attribute));

      let matches = false;
      const vals = db[dn][req.attribute];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] === req.value) {
          matches = true;
          break;
        }
      }

      res.end(matches);
      return next();
    });

    ldapServer.del(SUFFIX, authorize, function(req, res, next) {

      const dn = req.dn.toString();

      if (!db[dn]) return next(new ldap.NoSuchObjectError(dn));

      delete db[dn];

      res.end();
      return next();
    });

    ldapServer.modify(SUFFIX, authorize, function(req, res, next) {
      const dn = req.dn.toString();
      if (!req.changes.length)
        return next(new ldap.ProtocolError('changes required'));
      if (!db[dn]) return next(new ldap.NoSuchObjectError(dn));

      const entry = db[dn];

      for (let i = 0; i < req.changes.length; i++) {
        const mod = req.changes[i].modification;
        switch (req.changes[i].operation) {
          case 'replace':
            if (!entry[mod.type])
              return next(new ldap.NoSuchAttributeError(mod.type));

            if (!mod.vals || !mod.vals.length) {
              delete entry[mod.type];
            } else {
              entry[mod.type] = mod.vals;
            }

            break;

          case 'add':
            if (!entry[mod.type]) {
              entry[mod.type] = mod.vals;
            } else {
              mod.vals.forEach(function(v) {
                if (entry[mod.type].indexOf(v) === -1) entry[mod.type].push(v);
              });
            }

            break;

          case 'delete':
            if (!entry[mod.type])
              return next(new ldap.NoSuchAttributeError(mod.type));

            delete entry[mod.type];

            break;
        }
      }

      res.end();
      return next();
    });

    ldapServer.search(SUFFIX, authorize, function(req, res, next) {
      Object.keys(db).forEach(function(key) {
        if (req.filter.matches(db[key])) {
          res.send({
            dn: key,
            attributes: db[key],
          });
        }
      });

      res.end();
      return next();
    });

    ///--- Fire it up
    const start = () => new Promise((resolve) => ldapServer.listen(Number.parseInt(port), 'localhost', function() {
      console.log('LDAP server up at: %s', ldapServer.url);
      resolve();
    }))
    
    return start();
  })();

  const client = ldap.createClient({
    url: `ldap://localhost:${port}`,
  });
  client.bind('cn=root', 'secret', () => {
    const entries = [
      'Ben Hacker',
      'Sally Peters',
      'Chris Lincoln', 
      'Brian Lincoln',
      'Sharon Hestad',
      'Michael Henley',
      'Troy Prewitt',
      'Travis Fisher',
      'Dave Petet',
      'Brett Nowlin',
      'Kyle McCracken',
      'Ryan Keeler',
      'Nick Ortiz',
      'King Butcher',
      'Gannon Ross',
      'Tyler Tisdale',
      'Alex Larman',
      'Scott Carlson',
    ].map(fullName => {
      const name = fullName.split(' ');
      const username = `${name[0]
        .toLowerCase()
        .slice(0, 1)}${name[1].toLowerCase()}`;
      return {
        cn: fullName,
        givenname: name[0],
        sn: name[1],
        sAMAccountName: username,
        email: [`${username}@ultraxinc.com`],
        mail: `${username}@ultraxinc.com`,
        userpassword: '123',
        objectclass: 'Person',
      };
    });

    for(let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // There is a bug. Either here, or in the ldapjs code.
      // After this is complete, the ldap directory db only has the
      // first 15 entries from the test list above.
      // No errors are emitted
      client.add(`cn=${entry.sAMAccountName}, o=testultrax`, entry, function(
        err,
      ) {
        if (err) console.log(err);
      });
    }
  });
  return Promise.resolve();
};

runMockLDAPServer();